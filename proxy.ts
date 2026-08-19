import { NextResponse, type NextRequest } from "next/server";

import { buscarEventoPorDominio, buscarEventoPorSlug } from "@/lib/eventos";
import { ehSlug } from "@/lib/ids";
import { rotaDeApiQueCasa, type MetodoHttp } from "@/lib/rotas";
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
  matcher: ["/api/:caminho*", "/e/:slug/album"],
};
