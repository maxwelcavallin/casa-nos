/**
 * Token ao portador: como ele nasce, e como ele é guardado.
 *
 * TRÊS DECISÕES, E CADA UMA TEM UM MOTIVO QUE JÁ CUSTOU CARO EM ALGUM PRODUTO:
 *
 * 1. **O banco guarda o hash, nunca o token.** Quem lê a tabela — um dump, um
 *    backup, uma consulta de suporte, um vazamento — não ganha acesso a nada. O
 *    token existe em dois lugares: no cookie do aparelho e na URL do e-mail. Em
 *    lugar nenhum do nosso lado.
 *
 * 2. **Web Crypto, e não `node:crypto`.** O mesmo hash precisa ser calculado no
 *    middleware (que roda no runtime de borda) e nas rotas (Node). Duas
 *    implementações do mesmo hash é a forma mais silenciosa de o cookie parar de
 *    bater: o token continua válido, a consulta não acha a linha, e o convidado
 *    vira um aparelho novo no meio da festa — perdendo a fila dele.
 *
 * 3. **32 bytes, hexadecimal, 64 caracteres.** É o formato que o PRD §6.1 exige
 *    validar antes de qualquer consulta (`ehTokenDeAcesso`), pelo mesmo motivo
 *    de `ehUuid`: token malformado tem que ser 404 barato, não uma ida ao banco.
 */

/** 64 caracteres hexadecimais, minúsculos. É o formato de todo token daqui. */
const TOKEN = /^[0-9a-f]{64}$/;

export function ehTokenDeAcesso(valor: unknown): valor is string {
  return typeof valor === "string" && TOKEN.test(valor);
}

function paraHex(bytes: Uint8Array): string {
  let saida = "";
  for (const b of bytes) saida += b.toString(16).padStart(2, "0");
  return saida;
}

/**
 * Um token novo. 256 bits de aleatoriedade do sistema.
 *
 * `crypto.getRandomValues` e não `Math.random()`: o token é a credencial
 * inteira. `Math.random()` é previsível o bastante para que alguém com o token
 * de um moderador consiga adivinhar o do outro.
 */
export function novoToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return paraHex(bytes);
}

/**
 * O que vai para a coluna `token_hash`.
 *
 * Sem sal, e isto é deliberado: um sal por linha impediria a consulta por
 * índice (`where token_hash = $1`), obrigando a varrer a tabela e comparar uma a
 * uma. O que o sal protege é senha humana, que tem entropia baixa e se repete
 * entre serviços. Um token de 256 bits aleatórios não tem dicionário para
 * atacar — o pré-imagem do sha-256 é o ataque, e ele não existe.
 */
export async function hashDeToken(token: string): Promise<string> {
  const dados = new TextEncoder().encode(token);
  const digerido = await crypto.subtle.digest("SHA-256", dados);
  return paraHex(new Uint8Array(digerido));
}

/**
 * O nome do cookie de UM evento.
 *
 * UM COOKIE POR EVENTO (PRD §5.4). Sem isto, dois casamentos servidos pelo mesmo
 * host compartilhariam participação — o convidado de um apareceria como o mesmo
 * aparelho no outro, e é a pior falha de privacidade disponível aqui. Os oito
 * primeiros caracteres do uuid bastam para separar; o nome do cookie não é
 * segredo e não precisa ser único no mundo.
 */
export function nomeDoCookie(prefixo: "p" | "a", eventoId: string): string {
  return `${prefixo}_${eventoId.slice(0, 8)}`;
}

/** 12 meses, a mesma retenção da Q9 (participação do convidado). */
export const MAX_AGE_PARTICIPACAO = 60 * 60 * 24 * 365;
/** 30 dias (sessão do casal e do moderador, PRD §3.2 P4). */
export const MAX_AGE_ACESSO = 60 * 60 * 24 * 30;
/** 30 minutos, uma vez só (o convite por e-mail, H-02). */
export const VALIDADE_CONVITE_MINUTOS = 30;

/**
 * As opções do cookie, num lugar só.
 *
 * `secure` sai em desenvolvimento porque `localhost` não é https e o navegador
 * descarta o cookie em silêncio — o sintoma seria "o álbum cria uma participação
 * nova a cada carregamento", e ninguém liga isso a uma flag de cookie.
 */
export function opcoesDeCookie(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
