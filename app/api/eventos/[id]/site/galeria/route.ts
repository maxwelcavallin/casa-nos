import { NextResponse } from "next/server";

import {
  autorizar,
  corpoJson,
  naoEncontrado,
  pedidoInvalido,
  respostaDeErro,
  rotaDeApi,
} from "@/lib/api";
import { agoraNoServidor } from "@/lib/datas";
import { conferirMedidas, criarIntencaoDeFoto } from "@/lib/galeria";
import { ehUuid } from "@/lib/ids";
import {
  assinarPut,
  baseDoPublico,
  chavesDaFoto,
  configuracaoR2,
  VALIDADE_DA_URL_SEGUNDOS,
} from "@/lib/r2";

/**
 * A INTENÇÃO DE UMA FOTO DA GALERIA (v1.0, V-18).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ORDEM DENTRO DESTE ARQUIVO É O REQUISITO, e não uma consequência dele:
 *
 *   1. as medidas são conferidas   → RV-26, as cinco recusas nomeadas
 *   2. o R2 é conferido            → 503, **sem criar linha**
 *   3. `criarIntencaoDeFoto(...)`  → a linha em `evento_fotos`
 *   4. `assinarPut(...)` × 2       → as URLs, que contêm o `foto_id` do passo 3
 *
 * Os passos 3 e 4 não podem ser trocados nem paralelizados: a chave do objeto é
 * `pub/e/<evento>/g/<foto_id>/...`, e o `foto_id` só existe depois do passo 3.
 * **É isto que torna impossível existir objeto no balde sem linha no banco.**
 *
 * O PASSO 2 VEM ANTES DO 3, E AQUI ELE É DIFERENTE DO ÁLBUM. Na rota de
 * intenção de mídia, o R2 indisponível responde 503 **e a linha fica** — porque
 * lá a linha é o que a reconciliação diária procura, e perdê-la é perder a foto
 * do convidado. **A galeria não tem reconciliação e não precisa de uma**: o
 * original está no celular do casal, e o botão de tentar de novo refaz o
 * caminho inteiro. Guardar a linha aqui só produziria lixo na tabela que nenhum
 * cron limpa (é o que a 0015 escreve com todas as letras).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `site.editar`, e **nenhuma ação da galeria entra em `ACOES_DO_ALBUM`**
 * (RV-23). A semelhança superficial entre as duas convida ao contrário, e
 * `test/album-desligado.test.ts` tem a asserção inversa: com `album_ativo =
 * false`, esta rota responde normalmente.
 *
 * NÃO HÁ EVENTO DE GA4 AQUI, e a ausência é decisão (V-13): a v1.0 mede o site,
 * não o painel.
 */

const CAMINHO = "/api/eventos/[id]/site/galeria";

function paraInteiroOpcional(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
  return Math.trunc(valor);
}

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  // Antes de qualquer consulta (`dados.md` §3): uuid torto estoura `22P02` no
  // Postgres e vira 500 onde a resposta certa é 404.
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const campos = corpo as Record<string, unknown>;

  /**
   * RV-26 — **as medidas são validadas na escrita, e `not null` não é
   * validação**. Elas chegam do navegador que gerou a derivada e existem para a
   * página reservar a caixa antes do primeiro byte. Um par errado reserva a
   * caixa **errada**, que é o refluxo que as duas colunas existem para evitar —
   * e só aparece na foto de um casal específico.
   */
  const recusas = conferirMedidas(campos.largura, campos.altura);
  if (recusas.length > 0) {
    return pedidoInvalido({ campos: recusas });
  }

  /**
   * SEM R2, NÃO NASCE LINHA. 503, e a tela diz que o envio de fotos está
   * indisponível — não "erro".
   *
   * As DUAS variáveis são conferidas, e a segunda é a que se esquece:
   * `configuracaoR2()` é o que assina o `PUT`, e `baseDoPublico()` é o que
   * **serve a foto depois**. Sem a segunda, o envio funcionaria inteiro e a
   * página nunca mostraria a foto — o pior desfecho dos dois, porque não
   * produz nenhuma mensagem em lugar nenhum.
   */
  const configuracao = configuracaoR2();
  if (!configuracao || !baseDoPublico()) {
    return respostaDeErro(503, "armazenamento indisponivel");
  }

  const agora = agoraNoServidor();

  // ─── A linha, antes de qualquer URL existir. ───
  const foto = await criarIntencaoDeFoto(
    acesso.evento.id,
    {
      largura: campos.largura as number,
      altura: campos.altura as number,
      bytesPrevia: paraInteiroOpcional(campos.bytes_previa),
    }
  );

  // ─── As URLs, que só podem ser montadas com o id da linha acima. ───
  const chaves = chavesDaFoto(acesso.evento.id, foto.id);
  const [miniatura, previa] = await Promise.all([
    assinarPut(configuracao, chaves.miniatura, agora),
    assinarPut(configuracao, chaves.previa, agora),
  ]);

  return NextResponse.json({
    foto_id: foto.id,
    ordem: foto.ordem,
    // DUAS FAIXAS, e nenhum original: a prévia de 1600 é o que o site serve, a
    // miniatura de 400 é do editor. Não há terceira URL porque não há original
    // — e é isso que faz nenhum EXIF chegar ao balde.
    urls: { miniatura, previa },
    expira_em: new Date(agora.getTime() + VALIDADE_DA_URL_SEGUNDOS * 1000).toISOString(),
  });
});
