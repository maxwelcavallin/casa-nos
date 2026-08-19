/**
 * Brevo — o único caminho de e-mail do produto (`stack.md` §1).
 *
 * DOIS DESTINATÁRIOS, E SÓ DOIS, NESTA FATIA: o casal (o link de acesso da
 * H-02) e o dono (o alerta da H-18). Não existe régua de mensagens, não existe
 * e-mail ao convidado, e o convidado nem tem e-mail no sistema.
 *
 * SEM CHAVE CONFIGURADA, NADA É MANDADO — e a função devolve `false` em vez de
 * estourar. O motivo é o mesmo do GA4: um ambiente de pré-visualização sem
 * `BREVO_API_KEY` tem que continuar servindo o produto. O que ele não pode é
 * mentir dizendo que mandou, e por isso o retorno é booleano e quem chama
 * decide o que a tela mostra.
 *
 * O QUE NUNCA VAI NO CORPO: nome de convidado, rótulo de participação, telefone
 * e conteúdo de foto. O e-mail do casal é o único dado pessoal que este arquivo
 * toca, e ele é o destinatário.
 */

export type Mensagem = {
  para: string;
  assunto: string;
  /** Texto puro. Este produto não manda HTML nesta fatia — não há o que estilizar. */
  texto: string;
};

const ENDERECO = "https://api.brevo.com/v3/smtp/email";

export async function enviarEmail(mensagem: Mensagem): Promise<boolean> {
  const chave = process.env.BREVO_API_KEY;
  const remetente = process.env.BREVO_REMETENTE;
  if (!chave || !remetente) return false;

  try {
    const resposta = await fetch(ENDERECO, {
      method: "POST",
      headers: {
        "api-key": chave,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: remetente, name: "casa-nos" },
        to: [{ email: mensagem.para }],
        subject: mensagem.assunto,
        textContent: mensagem.texto,
      }),
    });
    return resposta.ok;
  } catch {
    /**
     * Rede de saída caiu.
     *
     * Não relança: o chamador é a rota que pede o link do casal, e ela responde
     * 202 de qualquer forma (H-02 — a resposta não conta se o e-mail existe). Um
     * `throw` aqui viraria 500 numa tela que precisa dizer "mandamos, confira a
     * caixa" mesmo quando a Brevo está fora do ar por trinta segundos.
     */
    return false;
  }
}
