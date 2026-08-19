import { NextResponse, type NextRequest } from "next/server";

import { buscarEventoPorDominio, buscarEventoPorSlug } from "@/lib/eventos";
import { ehSlug } from "@/lib/ids";
import { ehRotaCurta, rotaDeApiQueCasa, type MetodoHttp } from "@/lib/rotas";
import {
  ehTokenDeAcesso,
  MAX_AGE_PARTICIPACAO,
  nomeDoCookie,
  novoToken,
  opcoesDeCookie,
} from "@/lib/segredos";

/**
 * O PROXY faz DUAS coisas, e só duas.
 *
 * O NOME DO ARQUIVO: no Next 16 o `middleware.ts` foi renomeado para `proxy.ts`,
 * e o antigo emite aviso de descontinuação no build. O aviso é barulho que a
 * próxima pessoa vai investigar; o arquivo segue a convenção atual da
 * plataforma, e a função tem o nome que ela espera.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. O GUARDA DE ESCOPO POR MÉTODO HTTP (`stack.md` §3).
 *
 * `lib/rotas.ts` declara quais métodos cada rota aceita. O que não está
 * declarado responde **405 antes de existir handler**. Rota nova nasce protegida
 * sem ninguém lembrar de nada — e o dia em que alguém acrescentar um `DELETE`
 * num arquivo de rota sem declará-lo, ele simplesmente não responde, em vez de
 * responder e ninguém notar.
 *
 * 2. A PARTICIPAÇÃO NASCE NA PRIMEIRA RESPOSTA (H-05).
 *
 * "Abrir `/e/[slug]/album` cria a participação **na primeira resposta**, sem
 * pedir nada ao convidado e sem tela intermediária." Componente de servidor não
 * pode gravar cookie no Next; só rota, ação de servidor e middleware podem. Se
 * isso virasse um `POST` do cliente ao montar a página, a primeira resposta não
 * teria participação — e o convidado que abre o álbum e escolhe fotos em três
 * segundos, que é o comportamento que o produto persegue, encontraria um botão
 * que ainda não pode enviar.
 *
 * O QUE ELE **NÃO** FAZ AQUI: gravar a linha em `participacoes`. O middleware só
 * cunha o token e o entrega nos dois sentidos — no cookie da resposta e nos
 * cabeçalhos da requisição, para a página enxergá-lo no mesmo ciclo. A linha é
 * escrita pela página, com `on conflict`, porque escrita de banco no caminho de
 * borda de toda navegação é o tipo de custo que ninguém mede até a festa.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const METODOS: MetodoHttp[] = ["GET", "POST", "PATCH", "DELETE"];

function metodoDeclarado(caminho: string, metodo: string): boolean | null {
  const rota = rotaDeApiQueCasa(caminho);
  if (!rota) return null;
  const conhecido = METODOS.find(m => m === metodo);
  if (!conhecido) return false;
  return rota.metodos[conhecido] !== undefined;
}

export default async function proxy(pedido: NextRequest) {
  const caminho = pedido.nextUrl.pathname;

  if (caminho.startsWith("/api/")) {
    const declarado = metodoDeclarado(caminho, pedido.method);

    // `null` = rota não declarada em lib/rotas.ts. Ela não passa: ou é caminho
    // que não existe (e o 404 é a resposta certa), ou é rota nova que alguém
    // criou sem declarar — e nesse caso a catraca do teste já quebrou o CI, mas
    // aqui ela também não responde em produção.
    if (declarado === null) {
      return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
    }
    if (!declarado) {
      return NextResponse.json({ erro: "metodo nao permitido" }, { status: 405 });
    }
    return NextResponse.next();
  }

  const partes = caminho.split("/").filter(Boolean);

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * 3. A ROTA CURTA: `casa-nos.app/<slug>` → `/e/<slug>/album`, com **307**.
   *
   * É o endereço que vai impresso no cartão de mesa. `casa-nos.app/` são 13
   * caracteres; o endereço longo (`/e/<slug>/album`) come mais 11 antes do
   * slug, e o cartão de mesa é lido de pé, a um metro, por alguém segurando uma
   * taça. O `po` arbitrou em 19/08/2026: a rota existe, e ela **tira o 404 do
   * caminho** em vez de escolher entre um endereço comprido e um que não
   * responde.
   *
   * **307 E NÃO 301/308.** Um redirecionamento permanente é cacheado pelo
   * navegador *para sempre*, inclusive na aba de quem leu o QR errado; o dia em
   * que um slug for corrigido, o aparelho de quem já visitou continuaria indo
   * para o antigo, e não há como limpar isso remotamente. 307 preserva o método
   * e não é guardado — custa uma ida à rede por leitura de QR, uma vez.
   *
   * **A CONSULTA VIAJA INTEIRA**, e é o `?o=` que importa: ele é a origem por
   * superfície (`mesa`, `cartaz`, `telao`) e o único jeito de saber qual peça
   * impressa trouxe o convidado (`metricas.md` §15.1). Perdê-lo aqui faria toda
   * leitura de QR virar `direto`, e o passo 1 do funil — o gargalo real —
   * ficaria cego justamente na noite que decide o produto.
   *
   * O que **não** acontece aqui: consulta ao banco. Um slug inexistente
   * redireciona e o 404 acontece na página, que é onde ele já era. Consultar na
   * borda custaria uma ida ao Postgres em toda leitura de QR para adiantar um
   * erro que ninguém vai cometer.
   * ─────────────────────────────────────────────────────────────────────────
   */
  if (partes.length === 1 && ehSlug(partes[0]) && ehRotaCurta(partes[0])) {
    const destino = new URL(`/e/${partes[0]}/album`, pedido.nextUrl);
    destino.search = pedido.nextUrl.search;
    return NextResponse.redirect(destino, 307);
  }

  if (!(partes[0] === "e" && partes[2] === "album")) return NextResponse.next();

  const evento = ehSlug(partes[1])
    ? await buscarEventoPorSlug(partes[1])
    : await buscarEventoPorDominio(
        pedido.headers.get("x-forwarded-host") ?? pedido.headers.get("host")
      );

  // Slug desconhecido ou evento não publicado: nada a cunhar. A página responde
  // 404, e cunhar um cookie aqui só deixaria lixo no navegador de quem digitou
  // o endereço errado.
  if (!evento) return NextResponse.next();

  const nome = nomeDoCookie("p", evento.id);
  const existente = pedido.cookies.get(nome)?.value;
  if (ehTokenDeAcesso(existente)) return NextResponse.next();

  const token = novoToken();

  // O token vai nos DOIS sentidos: na requisição, para a página deste mesmo
  // ciclo enxergá-lo e gravar a linha; e na resposta, para o navegador guardar.
  pedido.cookies.set(nome, token);
  const resposta = NextResponse.next({ request: { headers: pedido.headers } });
  resposta.cookies.set({ name: nome, value: token, ...opcoesDeCookie(MAX_AGE_PARTICIPACAO) });
  return resposta;
}

export const config = {
  /**
   * Só o que precisa. Middleware que roda em tudo paga o custo dele em toda
   * imagem, todo `_next/static` e todo `favicon` — e neste produto o caminho
   * quente é justamente o de arquivos.
   */
  /**
   * Só o que precisa. Middleware que roda em tudo paga o custo dele em toda
   * imagem, todo `_next/static` e todo `favicon` — e neste produto o caminho
   * quente é justamente o de arquivos.
   *
   * `/:slug` entrou pela rota curta e é o único padrão largo daqui. Ele casa um
   * segmento só, e `ehRotaCurta` recusa tudo que o produto ocupa; a lista de
   * reservados vive em `lib/rotas.ts` e tem um teste que varre `app/`, porque o
   * defeito que ela evita — uma pasta nova roubar o endereço de um casamento já
   * impresso — não acusa em lugar nenhum.
   */
  matcher: ["/api/:caminho*", "/e/:slug/album", "/:slug"],
};
