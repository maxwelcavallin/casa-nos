import {
  hashDeSenha as hashBruto,
  precisaRecriarOHash as precisaRecriarBruto,
  senhaConfere as confereBruto,
} from "@/lib/senhas-nucleo.mjs";

/**
 * A SENHA: a fachada tipada, e a política.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O HASH NÃO MORA AQUI, E ISSO É DE PROPÓSITO.** Ele mora em
 * `lib/senhas-nucleo.mjs`, em JavaScript puro, porque duas pessoas precisam
 * produzir e conferir o mesmo valor: o produto e o terminal
 * (`scripts/conta.mjs`, que cria a conta do dono). Um script que
 * reimplementasse PBKDF2 "igualzinho" é como um login para de bater sem nenhum
 * erro aparecer — o formato continua válido e a senha simplesmente nunca
 * confere. Este arquivo dá os tipos e a régua; o núcleo dá a matemática.
 *
 * **PBKDF2-SHA-256 PELA WEB CRYPTO, E NÃO `scrypt` DO `node:crypto`.** É a mesma
 * decisão nº 2 de `lib/segredos.ts`: o produto tem dois runtimes, e uma função
 * de senha que só existe num deles é uma função que a próxima pessoa
 * reimplementa no outro.
 *
 * O que se perde, escrito para não ser redescoberto: `scrypt` e `argon2id`
 * resistem melhor a GPU, porque custam memória além de tempo. A troca é
 * consciente, e o contrapeso está nas 210 000 iterações — o piso que o OWASP
 * publica para PBKDF2-SHA-256. Trocar de função um dia é acrescentar um prefixo
 * novo, e não migrar ninguém: os parâmetros viajam dentro do valor guardado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** O valor que vai para `usuarios.senha_hash`. Nunca a senha. */
export const hashDeSenha = hashBruto as (senha: string) => Promise<string>;

/** `true` quando a senha confere. Hash malformado devolve `false`, e não estoura. */
export const senhaConfere = confereBruto as (
  senha: string,
  guardado: string
) => Promise<boolean>;

/** O hash nasceu com custo menor que o de hoje? Se sim, o login o reescreve. */
export const precisaRecriarOHash = precisaRecriarBruto as (guardado: string) => boolean;

/**
 * O comprimento mínimo, e por que não há regra de maiúscula, número e símbolo.
 *
 * Regra de composição produz `Senha@2027` — que é curta, previsível e passa em
 * qualquer validador. O que resiste é **comprimento**, e é o que o NIST
 * recomenda desde 2017: exija tamanho, não formato. Doze caracteres deixam
 * "casamento da ana" passar, e ela é melhor que `A@1b2c`.
 */
export const MINIMO_DE_SENHA = 12;

/**
 * O teto existe por negação de serviço, e não por segurança: cada tentativa
 * custa 210 000 iterações, e um campo sem teto deixa alguém mandar 10 MB de
 * senha para ocupar o servidor.
 */
export const MAXIMO_DE_SENHA = 200;

/**
 * A senha serve? Devolve a mensagem do campo, ou `null` quando serve.
 *
 * A mensagem diz **o que fazer**, e traz o número: "curta demais" manda a pessoa
 * adivinhar quanto falta. E a comparação com o e-mail existe porque o e-mail é a
 * primeira coisa que alguém repete num formulário de duas linhas.
 */
export function conferirSenha(senha: unknown, email?: string): string | null {
  if (typeof senha !== "string" || senha === "") return "Escolha uma senha.";
  if (senha.length < MINIMO_DE_SENHA) {
    return `A senha precisa de pelo menos ${MINIMO_DE_SENHA} caracteres. Uma frase que vocês lembrem serve melhor que um código difícil.`;
  }
  if (senha.length > MAXIMO_DE_SENHA) {
    return `A senha cabe em ${MAXIMO_DE_SENHA} caracteres.`;
  }
  if (email && senha.trim().toLowerCase() === email.trim().toLowerCase()) {
    return "A senha não pode ser o próprio e-mail.";
  }
  return null;
}
