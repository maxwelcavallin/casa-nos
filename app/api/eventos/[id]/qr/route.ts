import { NextResponse } from "next/server";

import { autorizar, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { origemDoQr } from "@/lib/analytics";
import { enderecoParaQr, origemDaRequisicao } from "@/lib/enderecos";
import { ehUuid } from "@/lib/ids";
import { qrParaSvg } from "@/lib/qr";
import { cor } from "@/lib/tokens";

/**
 * O CÓDIGO, GERADO (H-04).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SVG, SEMPRE, E É O QUE O CRITÉRIO PEDE. A H-04 exige "vetorial **ou** no
 * mínimo 1200 px no lado do código", e vetorial é o lado bom da escolha: um SVG
 * imprime na resolução da impressora, seja ela de 300 ou de 2400 dpi, e é o
 * mesmo arquivo que o navegador desenha no telão sem rasterizar. Um PNG de
 * 1200 px seria uma segunda coisa a manter, com um tamanho fixo escolhido por
 * palpite.
 *
 * O parâmetro `formato` existe e só aceita `svg`. Ele não é decoração: a rota
 * está no contrato da API (`docs/openapi-casa-nos.json`), e um `formato=png`
 * respondendo um SVG seria uma mentira silenciosa. Formato desconhecido é 400.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A COR VEM DO TOKEN, e não de um parâmetro: módulos em `cor.primary`, campo em
 * `cor.bg` (design system §16.9). **Nunca invertido** — QR claro sobre fundo
 * escuro falha em parte dos leitores de câmera, e é por isso que, mesmo num
 * telão escuro, o código vive dentro de um cartão claro.
 *
 * A ORIGEM POR SUPERFÍCIE (`?o=mesa`) é o que faz o passo 1 do funil ser
 * mensurável: sem ela, "de onde vieram os convidados que mandaram foto" não tem
 * resposta, e o cartão de mesa contra o cartaz vira palpite. Valor fora da lista
 * fechada vira `direto` (`lib/analytics.ts`).
 */

const CAMINHO = "/api/eventos/[id]/qr";

export const GET = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "evento.materiais.ver");
  if (!acesso.ok) return acesso.resposta;

  const parametros = new URL(pedido.url).searchParams;
  const formato = parametros.get("formato") ?? "svg";
  if (formato !== "svg") return pedidoInvalido("formato nao suportado");

  const superficie = origemDoQr(parametros.get("o"));
  const endereco = enderecoParaQr(
    origemDaRequisicao(pedido.headers),
    acesso.evento.slug,
    superficie
  );

  const svg = qrParaSvg(
    endereco,
    { modulo: cor.primary, campo: cor.bg },
    // O nome acessível NÃO carrega o nome do casal: este arquivo é baixado, é
    // colado num convite e vai para uma gráfica. Metadado é superfície de PII
    // tanto quanto a URL (RN-31), e um SVG viaja mais longe que uma página.
    { rotulo: "Codigo do album do casamento" }
  );

  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      /**
       * O nome do arquivo carrega a superfície — `qr-mesa.svg`, `qr-telao.svg`.
       * O casal baixa três materiais na mesma pasta de Downloads e precisa saber
       * qual é qual sem abrir os três.
       *
       * `inline` e não `attachment`: a mesma URL é usada pelo `<img>` da prévia
       * do cartão na tela de materiais. `attachment` faria o navegador tentar
       * baixar a prévia.
       */
      "content-disposition": `inline; filename="qr-${superficie}.svg"`,
      // Cache curto e privado: o endereço muda se o slug do evento mudar, e a
      // resposta é de um inquilino só.
      "cache-control": "private, max-age=60",
    },
  });
});
