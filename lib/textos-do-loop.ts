/**
 * Os textos do loop (H-16) — e este arquivo existe por um motivo de contrato,
 * não de organização.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `leads.permissao_texto` guarda **o texto que a pessoa leu**, e a coluna é
 * `not null` de propósito: sem ele, daqui a um ano ninguém sabe ao que ela
 * consentiu, e "ela aceitou" deixa de ser verificável exatamente no momento em
 * que alguém pergunta.
 *
 * Se a folha tivesse a frase e o servidor guardasse o que o corpo mandasse, um
 * cliente adulterado gravaria um consentimento que ninguém mostrou. Se cada lado
 * tivesse a própria cópia da frase, uma edição de copy no componente faria o
 * banco continuar guardando a versão velha — em silêncio, e para sempre.
 *
 * **A frase é uma só, este arquivo é o dono dela, e a rota recusa qualquer
 * outra.** Trocar a redação é trocar esta constante, e os leads antigos
 * continuam carregando a redação que valia quando foram criados, que é
 * precisamente o que a coluna existe para preservar.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Sem `import` de servidor aqui: este módulo entra no pacote do navegador, e
 * puxar `lib/db.ts` para dentro dele levaria o driver do Postgres junto.
 * A redação é do `gtm.md` §5.5, palavra por palavra.
 */

export const TEXTO_DA_PERMISSAO =
  "Tudo bem receber mensagem no WhatsApp sobre isso. Só sobre isso, e você pode pedir para parar quando quiser.";

export const CHAMADA_DO_CTA = "Vai casar?";
export const BOTAO_DO_CTA = "Quero isso no meu casamento";
export const TITULO_DA_FOLHA = "Quero isso no meu casamento";
export const EXPLICACAO_DA_FOLHA =
  "Deixa seu WhatsApp. A gente chama quando fizer sentido para a sua data, e não antes.";
export const BOTAO_DE_ENVIO = "Pode me chamar no WhatsApp";

export const ERRO_DO_NUMERO = "Faltam dígitos nesse número.";
export const ERRO_DO_MES = "Escolha um mês daqui para a frente.";
export const ERRO_SEM_REDE =
  "Guardamos aqui. A gente manda junto com as suas fotos assim que a rede voltar.";

export const SUCESSO_SEM_DATA =
  "Anotado. A gente guarda seu contato para quando você tiver data.";

/** `Anotado. A gente fala com você perto de agosto de 2027.` */
export function sucessoComData(mesPorExtenso: string): string {
  return `Anotado. A gente fala com você perto de ${mesPorExtenso}.`;
}

/* ------------------------------------------------------------------ *
 * H-22 — o link guardado
 * ------------------------------------------------------------------ */

export const TITULO_DO_LINK_GUARDADO = "Guardar o seu álbum";
export const EXPLICACAO_DO_LINK_GUARDADO =
  "Se você trocar de celular ou limpar o navegador, este link traz as suas fotos de volta.";
/**
 * A LINHA DE RISCO, e ela fica **acima** dos botões — nunca em letra miúda no
 * rodapé (`gtm.md` §5.6).
 *
 * É a informação que decide se a pessoa manda o link para um grupo de WhatsApp,
 * e por isso precisa ser lida antes da decisão, e não depois dela.
 */
export const RISCO_DO_LINK_GUARDADO =
  "Quem tiver este link pode ver, mudar e apagar as suas fotos. Não dá acesso a mais nada.";
export const AVISO_DE_LINK_NOVO = "Este link novo cancela o anterior.";
export const ERRO_DO_LINK_GUARDADO =
  "Não conseguimos gerar agora. O seu link anterior continua valendo.";
