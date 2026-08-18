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
}

export default nextConfig
