/**
 * A versão do que está no ar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELA EXISTE POR UMA LINHA DA H-12: o telão *"sobrevive a 6 horas sem
 * recarregar, com uma verificação de versão que recarrega sozinho **só quando
 * não há nada na tela**"*.
 *
 * O caso concreto: um ajuste subiu para a plataforma às 22h30, e o computador do
 * projetor está com a página de 19h aberta. Sem verificação, ele fica com o
 * código velho a noite inteira; com verificação ingênua, ele recarrega no meio
 * de uma foto — um piscar de três metros no meio da festa, que é exatamente o
 * que a tela promete nunca fazer.
 *
 * `VERCEL_DEPLOYMENT_ID` é lido **no servidor**, na rota do telão, e viaja na
 * resposta. Não é `NEXT_PUBLIC_*` de propósito: uma variável pública seria
 * fixada no pacote no momento do build, e o cliente compararia a versão dele com
 * ela mesma — a verificação existiria e nunca acusaria nada.
 *
 * Sem a variável (desenvolvimento, ou plataforma que não a fornece), o valor é
 * vazio e a verificação simplesmente não dispara. É o lado seguro de errar: pior
 * que um telão com código velho é um telão que recarrega sozinho sem motivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const VERSAO_DO_APP: string =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "";
