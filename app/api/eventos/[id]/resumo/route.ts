import { NextResponse } from "next/server";

import { autorizar, naoEncontrado, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import { resumoDoEvento } from "@/lib/painel-midias";

/**
 * OS NÚMEROS HONESTOS DO CASAL (H-14).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOIS NÚMEROS, EM CAMPOS SEPARADOS, E ELES **NUNCA SE SOMAM** (RN-15):
 *
 *   `armazenadas`        as fotos que chegaram — a prévia confirmou
 *   `em_alta_resolucao`  as que já têm as duas faixas
 *
 * Prévia faltando é **perda**; original faltando é **qualidade degradada**. Um
 * campo só faria as duas virarem uma, e o casal veria um número pior que a
 * realidade — que é exatamente o que este produto promete nunca fazer. A tela
 * escreve `1.842 fotos, 1.611 em alta resolução`, e a segunda linha existe para
 * explicar por que os números diferem, não para pedir desculpa.
 *
 * `chegando` é a terceira grandeza e também tem campo próprio: são as intenções
 * sem prévia. **Elas nunca entram em "recebida"** — o número exibido não pode
 * ser maior que a realidade, e uma foto que ainda está subindo não chegou.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A FONTE É O AGREGADO MANTIDO, e não `count(*)` ao vivo (PRD §5.6): com 200
 * clientes sondando, `count(*)` é o ponto 5 de quebra da §7 do `escopo-core.md`.
 * O cron diário recomputa da verdade e grava a divergência — que viaja aqui de
 * propósito, para o dono conseguir ver da tela que o agregado descolou.
 *
 * **Se esta rota falhar, a tela mostra um travessão e o motivo — nunca um zero**
 * (H-14). Por isso o erro é um status, e não um corpo com números zerados: 200
 * com `{ armazenadas: 0 }` é indistinguível de uma festa que não começou.
 */

const CAMINHO = "/api/eventos/[id]/resumo";

export const GET = rotaDeApi(CAMINHO, async (_pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "midia.ver.todas");
  if (!acesso.ok) return acesso.resposta;

  const resumo = await resumoDoEvento(acesso.evento.id);

  return NextResponse.json({
    armazenadas: resumo.armazenadas,
    em_alta_resolucao: resumo.emAltaResolucao,
    originais_pendentes: resumo.originaisPendentes,
    chegando: resumo.chegando,
    bytes_total: resumo.bytesTotal,
    recomputado_em: resumo.recomputadoEm,
    divergencia_ultima: resumo.divergenciaUltima,
  });
});
