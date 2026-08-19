import { NextResponse } from "next/server";

import { rotaDeApi, respostaDeErro } from "@/lib/api";
import { pode } from "@/lib/autorizacao";
import { eventosParaReconciliar } from "@/lib/eventos";
import { alertar } from "@/lib/observabilidade";
import {
  expurgarExcluidas,
  reconciliarEvento,
  recomputarContadores,
  varrerPublicoDoEvento,
} from "@/lib/reconciliacao";
import { sessaoDeCron } from "@/lib/sessao";

/**
 * O CRON DIÁRIO (H-15) — quatro trabalhos, e cada um cobre um modo de falha.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **RECONCILIAR** — `HEAD` nas chaves esperadas de toda mídia sem carimbo.
 *    Cobre a confirmação que se perdeu depois de o `PUT` ter dado certo, que é o
 *    modo de falha mais comum do produto: o aparelho gasta o uplink subindo o
 *    arquivo e fica sem rede na hora de avisar.
 *
 * 2. **VARRER `pub/`** — a guarda da RN-33. A troca de visibilidade é uma
 *    coreografia entre um banco e um balde, **sem transação entre os dois**: ela
 *    aborta antes do banco quando falha, mas o processo pode morrer no meio (a
 *    plataforma encerra a função). Sobra uma mídia `noivos` com objeto em `pub/`
 *    — e a promessa "só os noivos veem esta foto" fica quebrada **em silêncio**,
 *    que é o único modo de falha que este produto não pode ter.
 *
 * 3. **RECOMPUTAR** os contadores da verdade e gravar a divergência. Agregado
 *    sem recomputação vira número errado permanente, e o número errado que é
 *    rápido não levanta suspeita de ninguém.
 *
 * 4. **EXPURGAR** os objetos de mídias excluídas há mais de 30 dias (RN-20).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **12:00 UTC, QUE É 9h EM BRASÍLIA** (critério da H-15). O `vercel.json` fixa
 * isso, e o horário está dentro da janela que a regra da casa manda usar para
 * job que bate em API de terceiro (entre 12 e 20 UTC): ele conversa com o R2. Um
 * cron às 3h da manhã UTC rodaria à meia-noite de Brasília, no meio de uma festa
 * — exatamente quando as escritas do produto estão no pico.
 *
 * **SEGREDO DE CABEÇALHO, e sem `CRON_SEGREDO` a resposta é sempre anônima**
 * (`lib/sessao.ts`): nunca "passa porque a variável está vazia", que é como uma
 * rota interna vira pública num ambiente novo.
 */

const CAMINHO = "/api/interno/reconciliacao";

/** Acima disto numa hora, alguém precisa saber (H-18). */
const ADOCOES_QUE_VIRAM_ALERTA = 5;

async function rodar(pedido: Request): Promise<Response> {
  const sessao = sessaoDeCron(
    /**
     * DOIS CABEÇALHOS, E OS DOIS SÃO O MESMO SEGREDO.
     *
     * `x-cron-segredo` é o que o PRD §6.1 declara e o que um agendador externo
     * usa; `Authorization: Bearer` é o que **a Vercel manda**, e ela chama por
     * `GET`. Uma rota que só aceitasse a primeira forma responderia 401 todo dia
     * às 12h — e ninguém perceberia, porque ninguém olha o log de um cron que
     * "está configurado".
     */
    pedido.headers.get("x-cron-segredo") ?? pedido.headers.get("authorization")
  );
  if (pode(sessao, "interno.cron") === "nao") {
    // 401 e não 403: quem chega aqui sem o segredo não é uma sessão sem
    // permissão — é ninguém. E o corpo não diz o que existe do outro lado.
    return respostaDeErro(401, "nao autorizado");
  }

  const eventos = await eventosParaReconciliar();
  const relatorio = [];
  let adocoesTotais = 0;
  let indevidosTotais = 0;

  for (const evento of eventos) {
    /**
     * A ORDEM DENTRO DE CADA EVENTO IMPORTA: reconciliar **antes** de
     * recomputar, senão o contador é recomputado sobre a verdade de antes das
     * adoções e nasce errado no mesmo minuto em que foi corrigido.
     *
     * E o expurgo por último: ele apaga objeto, e apagar antes da reconciliação
     * tiraria do balde justamente o que a reconciliação procura.
     */
    const reconciliacao = await reconciliarEvento(evento.id);
    const varredura = await varrerPublicoDoEvento(evento.id);
    const contadores = await recomputarContadores(evento.id);
    const expurgo = await expurgarExcluidas(evento.id);

    adocoesTotais += reconciliacao.adocoes.length;
    indevidosTotais += varredura.indevidos.length;

    relatorio.push({
      evento_id: evento.id,
      conferidas: reconciliacao.conferidas,
      adotadas: reconciliacao.adocoes.length,
      previa_pendente_servidor: reconciliacao.previaPendenteServidor,
      publico_indevido: varredura.indevidos.length,
      publico_removido: varredura.removidos,
      armazenadas: contadores.armazenadas,
      divergencia: contadores.divergencia,
      expurgadas: expurgo.expurgadas,
    });
  }

  /**
   * OS DOIS ALERTAS DA H-18 QUE FALTAVAM, e agora existem porque o processo que
   * eles observam passou a existir.
   *
   * "Adoções acima de 5 numa hora" **não é sobre o conserto**: o conserto é bom.
   * É sobre o que ele revela — cinco confirmações perdidas significam que a rede
   * de alguém está engolindo requisições, e num sábado à noite isso é acionável.
   *
   * "Objeto indevido em `pub/`" é mais grave e nunca deveria acontecer: enquanto
   * ele existiu, uma foto marcada "só para os noivos" estava aberta a quem
   * tivesse o endereço.
   */
  if (adocoesTotais > ADOCOES_QUE_VIRAM_ALERTA) {
    await alertar(
      "casa-nos: confirmacoes de envio se perderam",
      `A reconciliacao adotou ${adocoesTotais} midia(s) nesta passada.\n` +
        `Cada adocao e uma confirmacao que nao chegou depois de o arquivo ter subido.\n` +
        `Acima de ${ADOCOES_QUE_VIRAM_ALERTA} numa passada, vale olhar a rede do evento.\n`
    );
  }
  if (indevidosTotais > 0) {
    await alertar(
      "casa-nos: objeto publico de midia privada",
      `A varredura encontrou ${indevidosTotais} midia(s) noivos ou excluidas com objeto em pub/.\n` +
        `Eles foram removidos. Enquanto existiram, a promessa "so os noivos veem esta foto"\n` +
        `estava falsa para quem tivesse o endereco. Confira se alguma troca de visibilidade\n` +
        `esta abortando no meio (eventos_de_erro, classe visibilidade.*).\n`
    );
  }

  return NextResponse.json({
    eventos: eventos.length,
    adotadas: adocoesTotais,
    publico_indevido: indevidosTotais,
    detalhes: relatorio,
  });
}

/**
 * `POST` é o contrato declarado (PRD §6.1); `GET` existe porque o agendador da
 * Vercel só sabe chamar `GET`. Os dois passam pelo mesmo segredo e fazem o mesmo
 * trabalho — a rotina é idempotente, então uma chamada a mais não muda nada.
 */
export const POST = rotaDeApi(CAMINHO, rodar);
export const GET = rotaDeApi(CAMINHO, rodar);
