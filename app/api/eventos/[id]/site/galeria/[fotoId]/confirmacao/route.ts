import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { conferirMedidas, confirmarFoto } from "@/lib/galeria";
import { ehUuid } from "@/lib/ids";

/**
 * O CARIMBO DA FOTO — a segunda metade do contrato de rede (v1.0, V-18).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O navegador faz os dois `PUT` direto no R2 com as URLs assinadas e depois
 * avisa aqui. Sem este aviso, os objetos existiriam no balde e o banco
 * continuaria dizendo "intenção" — e a foto **não apareceria no site**, porque
 * linha sem `armazenada_em` não renderiza e não conta (RV-25).
 *
 * **É AQUI QUE A FALHA PARCIAL TERMINA, E ELA É O CUSTO REAL DESTA HISTÓRIA.**
 * O laço tem quatro passos e o terceiro pode falhar sozinho: a miniatura sobe, a
 * prévia não. O álbum resolveu essa mesma falha com a fila inteira — motor,
 * armazém, recuo exponencial, máquina de estados. A galeria resolve com duas
 * coisas baratas, e elas bastam porque **o original está no celular do casal**:
 *
 *   1. Esta rota **só é chamada com os dois `PUT` concluídos**. Um envio que
 *      morre no meio não carimba nada, e a linha fica como intenção — invisível
 *      no site, invisível na contagem.
 *   2. O botão de **tentar de novo** reusa a MESMA linha: ele refaz os dois
 *      `PUT` (as URLs valem 24 h) e chama isto de novo. Nada duplica, porque
 *      nada foi criado.
 *
 * IDEMPOTENTE de propósito: `coalesce(armazenada_em, now())` mantém o primeiro
 * carimbo. Repetir a confirmação não é erro — é o funcionamento normal de quem
 * não teve certeza de que a primeira chegou.
 *
 * **AS MEDIDAS SÃO CONFERIDAS DE NOVO AQUI** (RV-26), e não é redundância: entre
 * a intenção e a confirmação o navegador pode ter refeito as derivadas — é
 * exatamente o que o botão de tentar de novo faz. Esta é a gravação que vale,
 * então é aqui que a régua precisa valer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/eventos/[id]/site/galeria/[fotoId]/confirmacao";

function paraInteiroOpcional(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
  return Math.trunc(valor);
}

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id, fotoId } = await contexto.params;
  // Os DOIS parâmetros, antes de qualquer consulta (`dados.md` §3).
  if (!ehUuid(id) || !ehUuid(fotoId)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const campos = corpo as Record<string, unknown>;

  const recusas = conferirMedidas(campos.largura, campos.altura);
  if (recusas.length > 0) return pedidoInvalido({ campos: recusas });

  /**
   * `evento_id` entra na cláusula `where` dentro de `confirmarFoto`. Foto de
   * outro casamento devolve `null`, que vira **404** — nunca 403, porque 403
   * confirmaria que a foto existe.
   */
  const foto = await confirmarFoto(acesso.evento.id, fotoId, {
    largura: campos.largura as number,
    altura: campos.altura as number,
    bytesPrevia: paraInteiroOpcional(campos.bytes_previa),
  });

  if (!foto) return naoEncontrado();

  return NextResponse.json({
    foto_id: foto.id,
    ordem: foto.ordem,
    armazenada: foto.armazenada,
  });
});
