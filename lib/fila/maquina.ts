import type { ItemDaFila, TipoDeFalha } from "@/lib/fila/tipos";

/**
 * A LÓGICA DA FILA, SEM REDE E SEM IndexedDB.
 *
 * Tudo aqui é função pura, e isso é a escolha central deste módulo. A aposta do
 * produto inteiro é a fila sobreviver ao wifi do salão — e "testar" isso com um
 * navegador de verdade num salão de verdade acontece **uma vez**, na noite da
 * festa. O que dá para verificar antes é o comportamento: quanto ela espera,
 * quando desiste (nunca), o que ela chama de falha, e o que ela faz com uma
 * resposta que não é nossa.
 *
 * `test/fila-maquina.test.ts` exercita cada uma destas funções com os casos que
 * o salão produz: modo avião intermitente, portal cativo, 500 do servidor, 422
 * de vídeo, URL expirada durante a noite.
 */

/**
 * O recuo: 2, 5, 15, 60 segundos, e 60 daí em diante.
 *
 * TETO DE 60 SEGUNDOS, E NENHUM LIMITE DE TENTATIVAS (H-07). Um recuo
 * exponencial sem teto chegaria a horas de espera na terceira falha, e a rede do
 * salão volta em minutos — o item ficaria dormindo depois de a rede ter voltado.
 * Um limite de tentativas seria pior: transformaria "adiou" em "perdeu", que é
 * exatamente a promessa que este produto faz.
 *
 * Sem tremulação (`jitter`) de propósito nesta fatia: com 200 convidados a
 * sincronia de retentativa é um risco real, mas o número que a resolve depende
 * do teste de carga (H-21, F1.7). Chutar agora seria escolher um valor que
 * ninguém mediu e que ninguém revisitaria.
 */
const RECUOS_EM_SEGUNDOS = [2, 5, 15, 60];

export function esperaEmMs(tentativas: number): number {
  const indice = Math.min(Math.max(tentativas, 1), RECUOS_EM_SEGUNDOS.length) - 1;
  return RECUOS_EM_SEGUNDOS[indice] * 1000;
}

/**
 * O que aconteceu, a partir da resposta.
 *
 * O CASO QUE ESTA FUNÇÃO EXISTE PARA PEGAR é o portal cativo (B2): a rede do
 * salão responde **200, com HTML**, à requisição que deveria ir para o R2. Sem
 * esta classificação, a fila marcaria a foto como enviada — o item sairia da
 * fila, o blob local seria apagado, e a foto teria evaporado com o produto
 * dizendo que estava tudo certo. É a pior falha disponível aqui, e ela é
 * silenciosa dos dois lados.
 *
 * O segundo caso é o desvio para outro domínio, que é como o mesmo portal se
 * apresenta em alguns roteadores.
 */
export function classificarResposta(resposta: {
  ok: boolean;
  status: number;
  tipoDeConteudo?: string | null;
  redirecionada?: boolean;
  urlFinal?: string | null;
  urlPedida?: string | null;
}): { sucesso: boolean; falha: TipoDeFalha | null } {
  const tipo = (resposta.tipoDeConteudo ?? "").toLowerCase();

  if (tipo.includes("text/html")) return { sucesso: false, falha: "portal" };

  if (resposta.redirecionada && resposta.urlFinal && resposta.urlPedida) {
    try {
      const destino = new URL(resposta.urlFinal).origin;
      const pedida = new URL(resposta.urlPedida).origin;
      if (destino !== pedida) return { sucesso: false, falha: "portal" };
    } catch {
      return { sucesso: false, falha: "portal" };
    }
  }

  if (resposta.ok) return { sucesso: true, falha: null };
  if (resposta.status >= 500) return { sucesso: false, falha: "servidor" };

  /**
   * 401, 403 e 404 no `PUT` do R2 são, quase sempre, **URL expirada** — e
   * expirada é temporária: repetir a intenção devolve URLs novas de 24 h. Tratar
   * como permanente faria a foto de quem dormiu com a fila cheia virar erro
   * definitivo às 24 h e um minuto, no produto cujo eixo é sobreviver à noite.
   */
  if (resposta.status === 401 || resposta.status === 403 || resposta.status === 404) {
    return { sucesso: false, falha: "rede" };
  }

  return { sucesso: false, falha: "arquivo" };
}

/**
 * A ordem em que a fila trabalha.
 *
 * PRÉVIA PRIMEIRO, SEMPRE. A prévia é a faixa que CONTA (RN-14): é ela que faz a
 * foto existir no álbum, no telão e na métrica. O original é qualidade, e pode
 * levar dias. Uma fila que subisse na ordem de seleção deixaria a foto de 40 MB
 * de alguém segurando a prévia de 300 KB de todo mundo — e num uplink de salão
 * isso é a diferença entre o produto funcionar e não funcionar.
 *
 * Dentro de cada faixa, a ordem é a de chegada: quem escolheu primeiro vê
 * primeiro, que é o único critério que a pessoa consegue prever.
 */
export function proximosDaFaixa(
  itens: ItemDaFila[],
  faixa: "previa" | "original",
  agora: number,
  quantidade: number
): ItemDaFila[] {
  return itens
    .filter(item => item.proximaTentativaEm <= agora)
    .filter(item => precisaDaFaixa(item, faixa))
    .sort((a, b) => a.criadoEm - b.criadoEm)
    .slice(0, quantidade);
}

export function precisaDaFaixa(item: ItemDaFila, faixa: "previa" | "original"): boolean {
  if (faixa === "previa") {
    return item.faixas.previa === "pendente" || item.faixas.miniatura === "pendente";
  }
  return item.faixas.original === "pendente";
}

/**
 * O item terminou? Só quando **as duas** faixas confirmaram (H-07).
 *
 * `pendente_servidor` conta como terminado do lado do aparelho: a prévia que o
 * navegador não conseguiu gerar é trabalho do cron (P12), e manter o item na
 * fila local esperando por ela faria o indicador dizer "faltam 6 fotos" para
 * sempre — sem nada para fazer e sem nada que o convidado pudesse fazer.
 */
export function terminou(item: ItemDaFila): boolean {
  const pronta = (estado: string) => estado === "confirmada" || estado === "pendente_servidor";
  return pronta(item.faixas.previa) && pronta(item.faixas.original);
}

/**
 * A concorrência de cada faixa.
 *
 * Prévia com 3 e original com 1, e a assimetria é o desenho: a prévia é curta e
 * é a que conta; o original é longo e não pode roubar banda dela. Com
 * `faixaLenta` (acima de 50 arquivos em 10 minutos, decisão P11), a prévia cai
 * para 1 — **despriorização, nunca recusa** (RN-11). Quem manda 200 fotos não
 * recebe erro; recebe uma fila mais devagar, e a fila de quem mandou 3 continua
 * andando.
 */
export function concorrencia(faixaLenta: boolean): { previa: number; original: number } {
  return faixaLenta ? { previa: 1, original: 1 } : { previa: 3, original: 1 };
}

/** As URLs assinadas ainda valem? Fora disso, a intenção é repetida (P10). */
export function urlsValidas(item: ItemDaFila, agora: number): boolean {
  if (!item.midiaId || !item.urls || !item.urlsExpiramEm) return false;
  // Uma folga de 5 minutos: uma URL que expira no meio de um envio de 40 MB
  // falharia depois de a foto inteira ter subido, e o aparelho pagaria o
  // uplink duas vezes.
  return agora < item.urlsExpiramEm - 5 * 60 * 1000;
}

/**
 * Quantos itens ainda faltam, e há quanto tempo o mais velho espera.
 *
 * CONTAGEM DE ITENS, NUNCA PORCENTAGEM (design system §16.6). Porcentagem mente
 * quando a fila cresce, e ela cresce: a pessoa manda mais seis fotos e a barra
 * "volta", o que lê como perda de progresso.
 */
export function resumoDaFila(
  itens: ItemDaFila[],
  agora: number
): { pendentes: number; maisVelhoEmSegundos: number } {
  const vivos = itens.filter(item => !terminou(item));
  const maisVelho = vivos.reduce((menor, item) => Math.min(menor, item.criadoEm), agora);
  return {
    pendentes: vivos.length,
    maisVelhoEmSegundos: Math.max(0, Math.round((agora - maisVelho) / 1000)),
  };
}

/** Idade da fila deste item, em segundos — vai no evento de sucesso. */
export function idadeEmSegundos(item: ItemDaFila, agora: number): number {
  return Math.max(0, Math.round((agora - item.criadoEm) / 1000));
}

/**
 * O vídeo é recusado NO APARELHO (RN-12), e as fotos do mesmo lote seguem.
 *
 * Aqui, e não no servidor: o vídeo de 200 MB não pode nem começar a subir no
 * uplink do salão. A rota tem a mesma recusa (422), mas ela é a segunda tranca —
 * quando a primeira funciona, o vídeo nunca sai do celular.
 */
export function ehVideo(tipoArquivo: string): boolean {
  return tipoArquivo.toLowerCase().startsWith("video/");
}
