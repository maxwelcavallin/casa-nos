import { sql, type Executor } from "@/lib/db";
import { paraTexto, paraTextoObrigatorio } from "@/lib/serializar-linha";

/**
 * O LEAD QUE SOBREVIVE A 18 MESES (H-16).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O LOOP NÃO FECHA POR COOKIE, E É POR ISSO QUE ISTO É TABELA.**
 *
 * O clique acontece no celular, na festa, às 23h. O cadastro acontece meses
 * depois, provavelmente noutro aparelho — e este produto roda com
 * `analytics_storage: denied`, ou seja, **não existe cookie segurando a ponta**.
 * Sem `evento_id_origem` persistido no servidor, o número que decide se este
 * negócio tem canal de aquisição sai **zero por construção** (`metricas.md`
 * §14.6). E o loop não tem segunda festa: se a Fatia 1 não gravar a origem, a
 * pergunta fica sem resposta por um ano.
 *
 * O `localStorage` com `referring_wedding_id` e o `?de=` na URL (§13.7)
 * continuam existindo — eles são a **segunda** ponta, para a Fatia 2 ler. Esta
 * tabela é a primeira, e é a que não depende do navegador.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **O WHATSAPP FICA AQUI, NUNCA NO GA4** (RN-24). Para o GA4 vão `has_date` e
 * `expected_month`, e nada mais: `2027-04`, jamais "casamento da Júlia em
 * abril". `test/analytics-sem-pii.test.tsx` guarda essa fronteira do outro lado.
 */

export type SuperficieDoCta = "confirmacao_envio" | "album" | "feed" | "telao";

export type NovoLead = {
  eventoIdOrigem: string;
  participacaoId: string | null;
  contato: string;
  nome: string | null;
  temData: boolean;
  mesPrevisto: string | null;
  ctaSuperficie: SuperficieDoCta;
  /** O texto que a pessoa leu. Gravado junto com a data — ver abaixo. */
  permissaoTexto: string;
};

export type Lead = {
  id: string;
  criadoEm: string;
  /** `true` quando o contato já existia nesta festa. A tela responde igual. */
  jaExistia: boolean;
};

/* ------------------------------------------------------------------ *
 * As duas validações, e as duas são de campo
 * ------------------------------------------------------------------ */

/**
 * Quantos dígitos um número brasileiro tem, com e sem DDI.
 *
 * 10 = fixo com DDD · 11 = celular com DDD · 12/13 = os mesmos com `+55`.
 * O teto de 15 é o do E.164, para o número estrangeiro de quem veio de fora.
 */
const MINIMO_DE_DIGITOS = 10;
const MAXIMO_DE_DIGITOS = 15;

/**
 * O contato, normalizado para dígitos.
 *
 * **NÃO REFORMATA ENQUANTO A PESSOA DIGITA** — a máscara ao vivo num teclado de
 * celular às 23h é a origem clássica de "faltam dígitos" em número certo. A
 * limpeza acontece uma vez, aqui, na fronteira; o campo aceita `+55 (21)
 * 90000-0000` e guarda `5521900000000`.
 *
 * Guardar só dígitos também é o que faz o índice único de
 * `(evento_id_origem, contato)` funcionar: sem normalizar, o mesmo número
 * digitado com e sem parênteses viraria dois leads.
 */
export function normalizarContato(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length < MINIMO_DE_DIGITOS || digitos.length > MAXIMO_DE_DIGITOS) return null;
  return digitos;
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * `AAAA-MM`, e **daqui para a frente**.
 *
 * A validação de faixa é do produto, não do banco: o `CHECK` da migration
 * garante o formato, e um mês no passado passaria por ele sem problema. "Março
 * de 2026" num casamento que ainda vai acontecer é erro de digitação, e o campo
 * diz isso — `Escolha um mês daqui para a frente.`
 *
 * A comparação é textual de propósito: `"2027-04" >= "2026-08"` é verdadeiro em
 * `AAAA-MM` porque o formato é ordenável como string. Passar por `Date` traria
 * de volta a armadilha da coluna `date` (meia-noite em UTC), e aqui nem existe
 * dia — é um mês.
 */
export function mesPrevistoValido(bruto: unknown, mesDeHoje: string): bruto is string {
  return typeof bruto === "string" && MES.test(bruto) && bruto >= mesDeHoje;
}

/** `"2026-08"` a partir de um instante, no fuso do evento. Sem passar por `Date`. */
export function mesDe(dia: string): string {
  return dia.slice(0, 7);
}

/* ------------------------------------------------------------------ *
 * A escrita
 * ------------------------------------------------------------------ */

/**
 * Grava o lead. **`evento_id_origem` é obrigatório na assinatura e no banco.**
 *
 * Não é redundância: a coluna é `not null` porque um lead sem origem não serve
 * para a única pergunta que a tabela existe para responder, e o parâmetro é
 * obrigatório para que ninguém precise lembrar. `test/leads.test.ts` prova que
 * esta rota não consegue criar um lead sem origem.
 *
 * O TEXTO DA PERMISSÃO É GRAVADO JUNTO COM A DATA. Sem o texto, daqui a um ano
 * ninguém sabe **ao que** a pessoa consentiu — e "ela aceitou" deixa de ser
 * verificável exatamente no momento em que alguém pergunta. É por isso que a
 * coluna é `not null` e não uma bandeira booleana.
 *
 * REENVIO NÃO VIRA SEGUNDO LEAD: a folha guarda e reenvia quando a rede volta
 * (H-16), e a fila pode acordar no dia seguinte com o mesmo lead. O
 * `on conflict do nothing` sobre `(evento_id_origem, contato)` faz a repetição
 * devolver o lead que já existe — e a tela responde a mesma coisa nos dois
 * casos, porque para quem deixou o contato **não aconteceu nada diferente**.
 */
export async function registrarLead(
  novo: NovoLead,
  exec: Executor = sql
): Promise<Lead> {
  const inseridas = await exec`
    insert into leads
      (evento_id_origem, participacao_id, cta_superficie, contato, nome,
       tem_data, mes_previsto, permissao_em, permissao_texto)
    values
      (${novo.eventoIdOrigem}::uuid, ${novo.participacaoId}::uuid, ${novo.ctaSuperficie},
       ${novo.contato}, ${novo.nome}, ${novo.temData}, ${novo.mesPrevisto},
       now(), ${novo.permissaoTexto})
    on conflict (evento_id_origem, contato) where excluido_em is null do nothing
    returning id, criado_em
  `;

  if (inseridas.length) {
    return {
      id: paraTextoObrigatorio(inseridas[0].id, "leads.id"),
      criadoEm: String(inseridas[0].criado_em),
      jaExistia: false,
    };
  }

  const existentes = await exec`
    select id, criado_em from leads
     where evento_id_origem = ${novo.eventoIdOrigem} and contato = ${novo.contato}
       and excluido_em is null
     limit 1
  `;
  return {
    id: paraTextoObrigatorio(existentes[0]?.id, "leads.id"),
    criadoEm: String(existentes[0]?.criado_em ?? ""),
    jaExistia: true,
  };
}

/**
 * A coorte, **aberta** (`metricas.md` §4.1).
 *
 * Enquanto a janela de 18 meses estiver correndo, "conversões" não é `0` — é
 * "ainda em aberto". Um zero aqui seria lido como fracasso do loop quando ele é
 * só o calendário ainda não tendo passado, e a leitura errada mataria a única
 * aquisição que este mercado paga. Quem consome isto é a consulta do dono, fora
 * da API.
 */
export type Coorte = {
  leads: number;
  comData: number;
  convertidos: number;
  /** Quantos ainda dentro dos 18 meses. É o que a tela mostra no lugar do zero. */
  emAberto: number;
};

export const JANELA_DO_LOOP_MESES = 18;

export async function coorteDoEvento(
  eventoId: string,
  exec: Executor = sql
): Promise<Coorte> {
  const [linha] = await exec`
    select count(*)::int as leads,
           count(*) filter (where tem_data)::int as com_data,
           count(*) filter (where convertido_em is not null)::int as convertidos,
           count(*) filter (
             where convertido_em is null
               and criado_em > now() - (${JANELA_DO_LOOP_MESES} * interval '1 month')
           )::int as em_aberto
      from leads
     where evento_id_origem = ${eventoId} and excluido_em is null
  `;
  const numero = (valor: unknown) => Number(paraTexto(valor) ?? 0) || 0;
  return {
    leads: numero(linha?.leads),
    comData: numero(linha?.com_data),
    convertidos: numero(linha?.convertidos),
    emAberto: numero(linha?.em_aberto),
  };
}
