/** @type {import('next').NextConfig} */
const nextConfig = {
  // Erro de tipo e de lint NAO sao ignorados no build. Quem mantem este projeto
  // nao roda o app localmente: o compilador e o lint sao a unica verificacao
  // que existe antes do convidado abrir a pagina no celular.
  typescript: { ignoreBuildErrors: false },
  // Nao existe chave `eslint` aqui: o Next 16 deixou de rodar o lint dentro do
  // build. Quem roda o ESLint e o `pnpm verificar` (e o hook de pre-commit).
  // Deixar a chave aqui so produziria um aviso e a falsa sensacao de que o
  // build linta.
  poweredByHeader: false,

  /**
   * REFERRER-POLICY: NO-REFERRER — a outra metade do conserto de privacidade.
   *
   * O QUE ACONTECIA SEM ISTO: mascarar o `page_location` conserta o CORPO do
   * hit, e nao o CABECALHO. Toda requisicao que a pagina faz a terceiro leva um
   * `Referer` montado pelo navegador, e no padrao (`strict-origin-when-cross-
   * origin`) ele carrega a origem inteira. Duas requisicoes saem para o Google
   * em toda visita: a busca do `gtag.js` e cada `/g/collect`. As duas levariam
   * `Referer: https://<dominio-do-casal>/` — e o dominio de um site de casamento
   * E o nome do casal escrito de outro jeito. O parametro mascarado no corpo e o
   * dominio em claro no cabecalho, no mesmo pacote.
   *
   * `no-referrer` e nao `same-origin` porque nenhum terceiro aqui precisa saber
   * de onde a requisicao veio, e porque `same-origin` continuaria mandando a URL
   * completa entre paginas nossas — o que reintroduz o slug na hora em que a
   * Fatia 1 criar a segunda tela.
   *
   * O QUE ISTO CUSTA: o site de hotel indicado pelo casal deixa de saber que a
   * visita veio daqui, e o log de servidor perde a referencia interna. Nada
   * depende dos dois. As tiles do OpenStreetMap foram verificadas sem `Referer`
   * e respondem 200 — a licenca deles pede identificacao por User-Agent, nao por
   * referencia.
   */
  async headers() {
    return [
      {
        source: "/:caminho*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ]
  },
}

export default nextConfig
