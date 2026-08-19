/**
 * Fronteira entre o banco e o resto do código.
 *
 * POR QUE EXISTE: `numeric`/`decimal` do Postgres chega em JavaScript como
 * **string**, não como number. Somar string concatena, e comparar string ordena
 * por caractere — `"9" > "10"` é verdadeiro. A conversão acontece aqui, uma vez,
 * e não espalhada por quem consome.
 *
 * Nesta fatia o `numeric` que existe é a coordenada do local
 * (`numeric(9,6)`), que vai para o link do mapa. Uma latitude concatenada em vez
 * de convertida manda o convidado para o lugar errado — e num site de casamento
 * um pin errado é pior que nenhum pin.
 *
 * Quando entrar dinheiro (Fatia 3), ele entra aqui com **duas funções irmãs de
 * nome explícito** (`fmtBRL` para centavos, `fmtBRLReal` para reais), nunca uma
 * só que adivinha a unidade.
 */

export function paraTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto === "" ? null : texto;
}

export function paraTextoObrigatorio(valor: unknown, campo: string): string {
  const texto = paraTexto(valor);
  if (texto === null) {
    throw new Error(`Campo obrigatório vazio vindo do banco: ${campo}`);
  }
  return texto;
}

/**
 * `numeric` → number. `"-22.951916"` vira `-22.951916`.
 *
 * Devolve `null` para nulo e para o que não é número — e não `NaN`, que
 * atravessaria o código silenciosamente e só apareceria como "NaN" na tela.
 */
export function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

export function paraBooleano(valor: unknown): boolean {
  return valor === true || valor === "t" || valor === "true";
}

export function paraInteiro(valor: unknown, padrao = 0): number {
  const numero = paraNumero(valor);
  return numero === null ? padrao : Math.trunc(numero);
}

/**
 * `timestamptz` → `Date`. Nulo continua nulo.
 *
 * ISTO NÃO SERVE PARA COLUNA `date`, e a distinção é a regra §5 de `dados.md`:
 * `date` chega como `"2027-08-22"` e é formatado como STRING (`lib/datas.ts`),
 * porque passar por `Date` devolve meia-noite em UTC — 21h do dia anterior aqui,
 * e um dia a menos em toda data sem hora. `timestamptz` é outra coisa: ali a
 * hora é informação, e o driver já entrega um `Date` correto.
 *
 * Existe para as colunas de janela e de carimbo da Fatia 1 (`envio_abre_em`,
 * `previa_armazenada_em`, `criada_em`), que são instantes de verdade.
 */
export function paraInstante(valor: unknown): Date | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const data = new Date(String(valor));
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * `bigint` do Postgres → number.
 *
 * O driver devolve `bigint` como STRING, pelo mesmo motivo de `numeric`: ele não
 * cabe em `Number` acima de 2^53. A coluna que usa isto aqui é
 * `midias.bytes` — e uma foto de 9 petabytes não existe, então a conversão é
 * segura. Está separada de `paraInteiro` para que a decisão fique escrita:
 * quando alguém somar bytes de um casamento inteiro num agregado, é aqui que
 * vai estar o comentário dizendo até onde a conversão vale.
 */
export function paraBytes(valor: unknown): number {
  return paraInteiro(valor, 0);
}
