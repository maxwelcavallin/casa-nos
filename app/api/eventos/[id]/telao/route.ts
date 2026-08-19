import { NextResponse } from "next/server";

import { carimbarUso } from "@/lib/acessos";
import { autorizar, naoEncontrado, rotaDeApi } from "@/lib/api";
import { fotosDoTelao } from "@/lib/feed";
import { ehUuid } from "@/lib/ids";
import { acessoDaSessao } from "@/lib/sessao";
import { VERSAO_DO_APP } from "@/lib/versao";

/**
 * O QUE O TELÃO BUSCA (H-12) — leitura pura, e nada mais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O TOKEN VEM NO CABEÇALHO `x-telao`, E NÃO NA CONSULTA.
 *
 * O telão é o único portador sem cookie: o computador ligado ao projetor abre um
 * link e não é autenticado por ninguém. O token precisa viajar de algum jeito, e
 * a consulta seria o caminho fácil — e o errado. Uma credencial ao portador que
 * vale a festa inteira, escrita numa URL, entra em log de acesso da plataforma,
 * no `Referer` de qualquer requisição que a página faça e no histórico do
 * navegador daquele computador, que é emprestado do salão.
 *
 * O cabeçalho não some de todo lugar, mas some desses três — e é a diferença
 * entre um token que vive no cache do navegador de um salão e um que não vive.
 * A validação de formato acontece em `lib/sessao.ts`, antes de qualquer
 * consulta.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **ESTA ROTA NÃO SABE DESENHAR ERRO.** Ela pode responder 401, 404 ou 500 — e a
 * tela do telão **não mostra nenhum deles**. Ela continua rodando o buffer que
 * já tem, em silêncio. Uma mensagem de erro projetada num casamento é incidente,
 * não estado. Quem descobre que o telão parou é o painel do dia ao vivo (H-19),
 * na tela do dono, e é lá que o alarme mora.
 *
 * O RECORTE É O MESMO DO FEED, e não um parecido — ver `lib/feed.ts`. Uma foto
 * que o convidado tirou do feed some da parede na próxima sondagem (≤ 15 s), e
 * isso vale porque as duas consultas são a mesma cláusula.
 */

const CAMINHO = "/api/eventos/[id]/telao";

export const GET = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "feed.ver", {
    tokenDoTelao: pedido.headers.get("x-telao"),
  });
  if (!acesso.ok) return acesso.resposta;

  const bruto = new URL(pedido.url).searchParams.get("desde");
  const instante = bruto ? new Date(bruto) : null;
  const desde = instante && !Number.isNaN(instante.getTime()) ? instante : null;

  const fotos = await fotosDoTelao(acesso.evento.id, desde);

  /**
   * O CARIMBO DE VIDA — e ele é a resposta para "como alguém descobre que o
   * telão congelou?".
   *
   * A parede não conta nada: erro projetado num casamento é incidente, não
   * estado, e telão parado é visualmente idêntico a telão rodando. A evidência
   * mora no banco: `evento_acessos.ultimo_uso_em` anda a cada sondagem
   * bem-sucedida (no máximo uma vez por minuto), e a distância entre ele e agora
   * é o que o painel do dono lê.
   *
   * Ele vai DEPOIS da consulta, de propósito: carimbar antes diria "o telão
   * pediu", e o que interessa é "o telão recebeu".
   */
  const doAcesso = acessoDaSessao(acesso.sessao);
  if (doAcesso) await carimbarUso(doAcesso.id);

  return NextResponse.json(
    {
      /**
       * A versão do que está no ar. O telão compara com a que ele carregou e se
       * recarrega **só quando não há nada na tela** (H-12) — uma recarga no meio
       * de uma foto é um piscar de três metros, e um deploy no meio da festa
       * não pode aparecer na parede.
       */
      versao: VERSAO_DO_APP,
      fotos: fotos.map(foto => ({
        id: foto.id,
        // A PRÉVIA (1600 px), não a miniatura: 400 px numa parede de 3 metros
        // são 7 px por centímetro.
        previa: foto.previa,
        // O rótulo discreto sobre a foto. `null` = participação sem nome, e na
        // parede **não se escreve "Convidado"** — a ausência é a especificação.
        rotulo: foto.rotulo,
        largura: foto.largura,
        altura: foto.altura,
        armazenada_em: foto.armazenadaEm,
      })),
    },
    { headers: { "cache-control": "private, max-age=5" } }
  );
});
