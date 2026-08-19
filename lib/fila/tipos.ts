import type { Visibilidade } from "@/lib/midias";

/**
 * O CONTRATO DO REGISTRO LOCAL — documentado em `docs/fila-local.md`.
 *
 * IndexedDB não é schema de banco, mas é schema: ele fica no aparelho do
 * convidado por 12 meses e sobrevive a deploy. Mudar a forma deste objeto
 * depois da festa significa que o celular de quem tem seis fotos pendentes
 * acorda com registros que o código novo não entende — e o produto perde
 * exatamente as fotos que ele existe para não perder.
 *
 * Por isso ele tem `versao`, e por isso ele nasce completo: os campos de faixa,
 * de tentativa e de disparo de evento já existem na F1.2, mesmo os que só a
 * F1.3 vai ler.
 *
 * **É por isso que a H-06 vem antes da H-07** (PRD §9.1, item 1): a fila
 * construída antes da intenção nasceria sem `midiaId` e sem `urls`, e
 * acrescentá-los depois obrigaria a migrar as filas que já existem nos
 * aparelhos de teste.
 */

export const VERSAO_DO_REGISTRO = 1;

export type FaixaLocal = "miniatura" | "previa" | "original";

export type EstadoDaFaixa =
  /** Ainda não subiu. */
  | "pendente"
  /** O servidor confirmou. O blob local desta faixa já foi apagado. */
  | "confirmada"
  /**
   * O navegador não decodificou o arquivo (HEIC exótico, B8). O original sobe
   * direto e a prévia fica para o servidor gerar (decisão P12). **Não é erro**,
   * e a interface diz "chegando", nunca "falhou".
   */
  | "pendente_servidor";

export type TipoDeFalha =
  /** Sem rede, DNS, tempo esgotado. Temporária, sempre. */
  | "rede"
  /** 5xx nosso. Temporária. */
  | "servidor"
  /** 4xx que não adianta repetir. A única que faz o item parar. */
  | "arquivo"
  /**
   * A resposta não é nossa: HTML de portal cativo, ou desvio para outro
   * domínio. Temporária, e a ÚNICA que tem ação na tela (B2).
   */
  | "portal";

export type ItemDaFila = {
  versao: number;

  /** Chave primária local e no servidor. Gerado no aparelho, uuid v4. */
  clientMediaId: string;
  eventoId: string;
  participacaoId: string;
  /** Agrupamento de rajada (B11, decisão P6): um por seleção. */
  loteId: string;

  visibilidade: Visibilidade;
  origem: "camera" | "galeria";
  tipoArquivo: string;
  bytes: number;
  /** sha-256 do conteúdo, calculado no aparelho. De-duplica reenvio. */
  hashConteudo: string;
  nomeLocal: string;

  /** Epoch em ms. Vira `queue_age_seconds` no evento de sucesso. */
  criadoEm: number;
  /** Estava sem rede no momento da seleção. Viaja até o GA4 no sucesso. */
  enfileiradaOffline: boolean;

  /** Só existe depois da intenção. É o que prova que o servidor sabe da foto. */
  midiaId: string | null;
  urls: Partial<Record<FaixaLocal, string>> | null;
  /** Epoch em ms. As URLs valem 24 h (P10) e são renovadas repetindo a intenção. */
  urlsExpiramEm: number | null;

  faixas: Record<FaixaLocal, EstadoDaFaixa>;

  tentativas: number;
  /** Epoch em ms. Antes disto, o item não é tocado (recuo crescente). */
  proximaTentativaEm: number;
  ultimaFalha: TipoDeFalha | null;

  /**
   * A marca que impede `media_upload_succeeded` de contar duas vezes (RN-28).
   *
   * Ela mora AQUI, no registro que sobrevive ao fechamento da aba — e não em
   * memória. Uma confirmação repetida do servidor (que acontece: a fila
   * reconfirma quando não tem certeza) viraria um segundo evento, e participação
   * inflada por retentativa é o erro mais fácil de cometer neste produto e o
   * mais difícil de perceber depois.
   */
  eventoDisparado: Partial<Record<"previa" | "original", boolean>>;
};

/** O blob de uma faixa, guardado à parte para poder ser apagado sozinho. */
export type BlobDaFila = {
  chave: string;
  clientMediaId: string;
  faixa: FaixaLocal;
  dados: Blob;
};

export function chaveDoBlob(clientMediaId: string, faixa: FaixaLocal): string {
  return `${clientMediaId}:${faixa}`;
}

/** Um item novo, antes de qualquer rede. */
export function itemNovo(
  base: Pick<
    ItemDaFila,
    | "clientMediaId"
    | "eventoId"
    | "participacaoId"
    | "loteId"
    | "visibilidade"
    | "origem"
    | "tipoArquivo"
    | "bytes"
    | "hashConteudo"
    | "nomeLocal"
    | "enfileiradaOffline"
  >,
  agora: number,
  previaGerada: boolean
): ItemDaFila {
  return {
    ...base,
    versao: VERSAO_DO_REGISTRO,
    criadoEm: agora,
    midiaId: null,
    urls: null,
    urlsExpiramEm: null,
    faixas: {
      miniatura: previaGerada ? "pendente" : "pendente_servidor",
      previa: previaGerada ? "pendente" : "pendente_servidor",
      original: "pendente",
    },
    tentativas: 0,
    proximaTentativaEm: agora,
    ultimaFalha: null,
    eventoDisparado: {},
  };
}
