/**
 * O CÓDIGO QR — codificador próprio, em modo byte, correção M, versões 1 a 10.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESCRITO AQUI E NÃO INSTALADO (H-04).
 *
 * O QR é o passo 1 do funil inteiro deste produto: se ele não ler, não existe
 * foto, não existe feed e não existe telão. O critério de aceite da H-04 exige
 * que o arquivo seja **vetorial ou com no mínimo 1200 px no lado do código** e
 * que ele seja lido pela câmera nativa de um Android e de um iPhone, impresso em
 * papel comum, sob luz baixa.
 *
 * Um pacote de terceiro resolveria a geração e traria três coisas que este
 * projeto não quer no caminho crítico: uma dependência de canvas (que não roda
 * na borda), um SVG cuja cor sai de um parâmetro em vez do token, e — o que
 * pesa mais — **nada que este ambiente consiga verificar antes da festa**. O
 * codificador aqui é determinístico e roda no `vitest`: `test/qr.test.ts`
 * decodifica o resultado de volta e compara com a entrada, o que é a única
 * prova possível sem uma câmera.
 *
 * O QUE ELE FAZ, E SÓ ISSO: modo byte (ISO-8859-1/ASCII, que é o que uma URL
 * curta é), nível de correção **M** (~15%), versões 1 a 10 — de 14 a 213
 * caracteres. Uma URL deste produto tem ~38. Acima de 213 ele lança, em vez de
 * devolver um código que a câmera não lê.
 *
 * O NÍVEL M E NÃO H: H reserva 30% e infla o código de 29×29 para 41×41 na
 * mesma URL. Numa mesa, mais módulos no mesmo espaço é menos milímetro por
 * módulo, que é o que a câmera precisa. M é o nível que a própria especificação
 * chama de padrão, e o cartão impresso não vai ficar sujo de graxa numa fábrica.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Referência: ISO/IEC 18004. Os números das tabelas abaixo estão conferidos por
 * `test/qr.test.ts`, que refaz a aritmética a partir do total de códigos de cada
 * versão em vez de confiar na transcrição.
 */

/* ------------------------------------------------------------------ *
 * 1. As tabelas da especificação, só o recorte que este produto usa
 * ------------------------------------------------------------------ */

/** Total de códigos (dados + correção) por versão. Índice 0 = versão 1. */
const TOTAL_DE_CODIGOS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346] as const;

/**
 * Estrutura de blocos do nível M: [códigos de correção por bloco, blocos do
 * grupo 1, códigos de dados no grupo 1, blocos do grupo 2, códigos no grupo 2].
 */
const BLOCOS_M: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [10, 1, 16, 0, 0], //  v1
  [16, 1, 28, 0, 0], //  v2
  [26, 1, 44, 0, 0], //  v3
  [18, 2, 32, 0, 0], //  v4
  [24, 2, 43, 0, 0], //  v5
  [16, 4, 27, 0, 0], //  v6
  [18, 4, 31, 0, 0], //  v7
  [22, 2, 38, 2, 39], // v8
  [22, 3, 36, 2, 37], // v9
  [26, 4, 43, 1, 44], // v10
];

/** Centros dos padrões de alinhamento, por versão. A v1 não tem nenhum. */
const ALINHAMENTO: ReadonlyArray<readonly number[]> = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

export const VERSAO_MAXIMA = TOTAL_DE_CODIGOS.length;

function codigosDeDados(versao: number): number {
  const [ec, b1, d1, b2, d2] = BLOCOS_M[versao - 1];
  return b1 * d1 + b2 * d2 + 0 * ec;
}

/** 8 bits de contagem até a versão 9; 16 a partir da 10 (modo byte). */
function bitsDeContagem(versao: number): number {
  return versao < 10 ? 8 : 16;
}

/**
 * A estrutura de blocos desta versão. Exportada para `test/qr.test.ts`, que
 * refaz a aritmética (total = dados + correção × blocos) em vez de confiar na
 * transcrição da tabela — um dígito errado ali produz um código que só falha na
 * câmera.
 */
export function estruturaDeBlocos(versao: number) {
  const [ec, b1, d1, b2, d2] = BLOCOS_M[versao - 1];
  return { ec, b1, d1, b2, d2, total: TOTAL_DE_CODIGOS[versao - 1] };
}

/** Quantos caracteres cabem nesta versão, em modo byte. */
export function capacidadeEmBytes(versao: number): number {
  return Math.floor((codigosDeDados(versao) * 8 - 4 - bitsDeContagem(versao)) / 8);
}

/**
 * A menor versão que comporta este texto.
 *
 * A menor de propósito: cada versão a mais são 4 módulos a mais de lado, e no
 * cartão de mesa o espaço é fixo — versão maior significa módulo menor, e módulo
 * menor é o que faz a câmera desistir com pouca luz.
 */
export function menorVersaoPara(bytes: number): number {
  for (let versao = 1; versao <= VERSAO_MAXIMA; versao++) {
    if (bytes <= capacidadeEmBytes(versao)) return versao;
  }
  throw new Error(
    `Texto de ${bytes} bytes nao cabe num QR versao ${VERSAO_MAXIMA} nivel M ` +
      `(teto de ${capacidadeEmBytes(VERSAO_MAXIMA)}). Encurte o endereco.`
  );
}

/* ------------------------------------------------------------------ *
 * 2. Aritmética do corpo de Galois GF(256)
 * ------------------------------------------------------------------ */

/**
 * Polinômio primitivo 0x11D, que é o da especificação do QR.
 *
 * As tabelas são construídas uma vez, na carga do módulo: 512 entradas, e elas
 * evitam uma exponenciação por multiplicação — a correção de erro de um código
 * versão 10 faz alguns milhares delas.
 */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function multiplicar(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** O polinômio gerador de `grau` códigos de correção. */
function gerador(grau: number): Uint8Array {
  let poli = new Uint8Array([1]);
  for (let i = 0; i < grau; i++) {
    const proximo = new Uint8Array(poli.length + 1);
    for (let j = 0; j < poli.length; j++) {
      proximo[j] ^= poli[j];
      proximo[j + 1] ^= multiplicar(poli[j], EXP[i]);
    }
    poli = proximo;
  }
  return poli;
}

/**
 * Os códigos de correção de um bloco (divisão polinomial de Reed-Solomon).
 *
 * Exportada para o teste: é a única parte deste arquivo cujo resultado tem um
 * valor publicado com que comparar, e é a que decide se o código lê.
 */
export function correcaoDoBloco(dados: Uint8Array, quantos: number): Uint8Array {
  const g = gerador(quantos);
  const resto = new Uint8Array(dados.length + quantos);
  resto.set(dados);
  for (let i = 0; i < dados.length; i++) {
    const fator = resto[i];
    if (fator === 0) continue;
    for (let j = 0; j < g.length; j++) {
      resto[i + j] ^= multiplicar(g[j], fator);
    }
  }
  return resto.slice(dados.length);
}

/* ------------------------------------------------------------------ *
 * 3. Do texto aos códigos, já intercalados
 * ------------------------------------------------------------------ */

class Bits {
  private readonly bytes: number[] = [];
  private parciais = 0;
  private quantos = 0;

  empurrar(valor: number, largura: number): void {
    for (let i = largura - 1; i >= 0; i--) {
      this.parciais = (this.parciais << 1) | ((valor >> i) & 1);
      this.quantos++;
      if (this.quantos === 8) {
        this.bytes.push(this.parciais);
        this.parciais = 0;
        this.quantos = 0;
      }
    }
  }

  /** Fecha o byte corrente com zeros. */
  fechar(): number[] {
    if (this.quantos > 0) {
      this.bytes.push(this.parciais << (8 - this.quantos));
      this.parciais = 0;
      this.quantos = 0;
    }
    return this.bytes;
  }

  get bitsEscritos(): number {
    return this.bytes.length * 8 + this.quantos;
  }
}

/**
 * O texto → o vetor de códigos final, com correção e já intercalado.
 *
 * A INTERCALAÇÃO É O PASSO QUE NINGUÉM VÊ E QUE QUEBRA TUDO SE FALTAR: acima da
 * versão 3 os dados vão em blocos, e a especificação manda gravá-los alternados
 * (primeiro código de cada bloco, depois o segundo de cada bloco...). É o que
 * espalha um arranhão do papel entre todos os blocos em vez de concentrá-lo num
 * só — que é justamente o que a correção de erro não conseguiria recuperar.
 */
export function codigosDe(texto: string, versao: number): Uint8Array {
  const dados = paraBytesLatin1(texto);
  const totalDeDados = codigosDeDados(versao);

  const bits = new Bits();
  bits.empurrar(0b0100, 4); // modo byte
  bits.empurrar(dados.length, bitsDeContagem(versao));
  for (const b of dados) bits.empurrar(b, 8);

  // Terminador: até 4 zeros, ou menos se o espaço acabar antes.
  const sobra = totalDeDados * 8 - bits.bitsEscritos;
  bits.empurrar(0, Math.min(4, Math.max(0, sobra)));

  const codigos = bits.fechar();
  // Preenchimento alternado 0xEC / 0x11, como manda a especificação.
  const enchimento = [0xec, 0x11];
  for (let i = 0; codigos.length < totalDeDados; i++) {
    codigos.push(enchimento[i % 2]);
  }

  const [ec, b1, d1, b2, d2] = BLOCOS_M[versao - 1];
  const blocosDeDados: Uint8Array[] = [];
  const blocosDeCorrecao: Uint8Array[] = [];
  let cursor = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const tamanho = i < b1 ? d1 : d2;
    const bloco = Uint8Array.from(codigos.slice(cursor, cursor + tamanho));
    cursor += tamanho;
    blocosDeDados.push(bloco);
    blocosDeCorrecao.push(correcaoDoBloco(bloco, ec));
  }

  const saida: number[] = [];
  const maiorDeDados = Math.max(d1, d2);
  for (let i = 0; i < maiorDeDados; i++) {
    for (const bloco of blocosDeDados) if (i < bloco.length) saida.push(bloco[i]);
  }
  for (let i = 0; i < ec; i++) {
    for (const bloco of blocosDeCorrecao) saida.push(bloco[i]);
  }
  return Uint8Array.from(saida);
}

/**
 * Texto → bytes, em Latin-1.
 *
 * O modo byte do QR é declarado como ISO-8859-1. Uma URL deste produto é ASCII
 * puro (o slug é validado por `ehSlug`), então a conversão é a identidade — mas
 * a checagem existe para o dia em que alguém passar um endereço com acento: aí a
 * resposta certa é um erro aqui, e não um QR que a câmera lê como lixo.
 */
function paraBytesLatin1(texto: string): number[] {
  const bytes: number[] = [];
  for (const caractere of texto) {
    const ponto = caractere.codePointAt(0) ?? 0;
    if (ponto > 0xff) {
      throw new Error(
        `Caractere fora de ISO-8859-1 no conteudo do QR: ${JSON.stringify(caractere)}. ` +
          "O endereco do album e ASCII por construcao (ehSlug); se isto disparou, " +
          "alguem passou outra coisa."
      );
    }
    bytes.push(ponto);
  }
  return bytes;
}

/* ------------------------------------------------------------------ *
 * 4. A matriz
 * ------------------------------------------------------------------ */

type Matriz = {
  lado: number;
  /** `true` = módulo escuro. */
  modulos: boolean[][];
  /** `true` = posição reservada (padrão, temporização, formato, versão). */
  reservados: boolean[][];
};

function matrizVazia(lado: number): Matriz {
  return {
    lado,
    modulos: Array.from({ length: lado }, () => new Array<boolean>(lado).fill(false)),
    reservados: Array.from({ length: lado }, () => new Array<boolean>(lado).fill(false)),
  };
}

function marcar(m: Matriz, x: number, y: number, escuro: boolean): void {
  m.modulos[y][x] = escuro;
  m.reservados[y][x] = true;
}

function localizador(m: Matriz, cx: number, cy: number): void {
  // O quadrado de 7×7 mais o separador de 1 módulo em volta.
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= m.lado || y >= m.lado) continue;
      const naBorda = dx === 0 || dx === 6 || dy === 0 || dy === 6;
      const noMiolo = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      const dentro = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      marcar(m, x, y, dentro && (naBorda || noMiolo));
    }
  }
}

function alinhamento(m: Matriz, versao: number): void {
  const centros = ALINHAMENTO[versao - 1];
  for (const cy of centros) {
    for (const cx of centros) {
      // Os três cantos dos localizadores não recebem alinhamento.
      if (m.reservados[cy][cx]) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const naBorda = Math.abs(dx) === 2 || Math.abs(dy) === 2;
          const noCentro = dx === 0 && dy === 0;
          marcar(m, cx + dx, cy + dy, naBorda || noCentro);
        }
      }
    }
  }
}

function temporizacao(m: Matriz): void {
  for (let i = 8; i < m.lado - 8; i++) {
    const escuro = i % 2 === 0;
    marcar(m, i, 6, escuro);
    marcar(m, 6, i, escuro);
  }
}

/** Reserva as 31 posições de formato e o módulo escuro obrigatório. */
function reservarFormato(m: Matriz): void {
  for (let i = 0; i < 9; i++) {
    if (!m.reservados[8][i]) marcar(m, i, 8, false);
    if (!m.reservados[i][8]) marcar(m, 8, i, false);
  }
  for (let i = 0; i < 8; i++) {
    marcar(m, m.lado - 1 - i, 8, false);
    marcar(m, 8, m.lado - 1 - i, false);
  }
  // O módulo escuro: sempre em (8, lado - 8), e sempre escuro.
  marcar(m, 8, m.lado - 8, true);
}

function reservarVersao(m: Matriz, versao: number): void {
  if (versao < 7) return;
  const informacao = informacaoDeVersao(versao);
  for (let i = 0; i < 18; i++) {
    const bit = ((informacao >> i) & 1) === 1;
    const linha = Math.floor(i / 3);
    const coluna = i % 3;
    marcar(m, linha, m.lado - 11 + coluna, bit);
    marcar(m, m.lado - 11 + coluna, linha, bit);
  }
}

/** BCH(18,6) com gerador 0x1F25 — só existe da versão 7 em diante. */
export function informacaoDeVersao(versao: number): number {
  let resto = versao;
  for (let i = 0; i < 12; i++) {
    resto = (resto << 1) ^ (((resto >> 11) & 1) * 0x1f25);
  }
  return (versao << 12) | (resto & 0xfff);
}

/**
 * BCH(15,5) com gerador 0x537, embaralhado com 0x5412.
 *
 * O XOR final não é decoração: sem ele, o formato do nível M com máscara 0 seria
 * quinze zeros — um campo inteiro claro dentro do código, indistinguível de
 * papel em branco para o leitor.
 */
export function informacaoDeFormato(mascara: number): number {
  const NIVEL_M = 0b00;
  const dado = (NIVEL_M << 3) | mascara;
  let resto = dado;
  for (let i = 0; i < 10; i++) {
    resto = (resto << 1) ^ (((resto >> 9) & 1) * 0x537);
  }
  return ((dado << 10) | (resto & 0x3ff)) ^ 0x5412;
}

function gravarFormato(m: Matriz, mascara: number): void {
  const informacao = informacaoDeFormato(mascara);
  for (let i = 0; i < 15; i++) {
    const bit = ((informacao >> i) & 1) === 1;
    // Cópia 1, em volta do localizador superior esquerdo.
    if (i < 6) m.modulos[8][i] = bit;
    else if (i === 6) m.modulos[8][7] = bit;
    else if (i === 7) m.modulos[8][8] = bit;
    else if (i === 8) m.modulos[7][8] = bit;
    else m.modulos[14 - i][8] = bit;

    /**
     * Cópia 2: SETE bits na coluna 8 (de baixo para cima) e OITO na linha 8 (à
     * direita). A divisão 7/8 — e não 8/7 — é o que preserva o módulo escuro
     * obrigatório em (linha `lado-8`, coluna 8). Errar aqui produz um código que
     * alguns leitores aceitam e outros recusam, que é o pior defeito possível:
     * ele passa no teste de quem gerou e falha na mesa do convidado.
     */
    if (i < 7) m.modulos[m.lado - 1 - i][8] = bit;
    else m.modulos[8][m.lado - 15 + i] = bit;
  }
  m.modulos[m.lado - 8][8] = true; // o módulo escuro, de novo por garantia
}

function aplicarMascara(x: number, y: number, mascara: number): boolean {
  switch (mascara) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/**
 * Percorre as posições de dados na ordem da especificação: colunas em pares, da
 * direita para a esquerda, subindo e descendo alternadamente.
 *
 * A COLUNA 6 É PULADA INTEIRA — ela é a de temporização. O jeito errado óbvio é
 * "quando a coluna for 6, use a 5": isso faz o par (5,4) ser visitado e, na
 * volta do laço, o par (4,3) também — a coluna 4 recebe dois bits diferentes e o
 * código sai ilegível. A variável do laço é que anda para 5, e o `-= 2` seguinte
 * a leva para 3.
 */
function posicoesDeDados(m: Matriz): Array<[number, number]> {
  const posicoes: Array<[number, number]> = [];
  for (let direita = m.lado - 1; direita >= 1; direita -= 2) {
    if (direita === 6) direita = 5;
    const subindo = ((direita + 1) & 2) === 0;
    for (let passo = 0; passo < m.lado; passo++) {
      const y = subindo ? m.lado - 1 - passo : passo;
      for (let j = 0; j < 2; j++) {
        const x = direita - j;
        if (m.reservados[y][x]) continue;
        posicoes.push([x, y]);
      }
    }
  }
  return posicoes;
}

function gravarDados(m: Matriz, codigos: Uint8Array, mascara: number): void {
  let indice = 0;
  let bit = 7;
  for (const [x, y] of posicoesDeDados(m)) {
    let escuro = false;
    if (indice < codigos.length) {
      escuro = ((codigos[indice] >> bit) & 1) === 1;
      bit--;
      if (bit < 0) {
        bit = 7;
        indice++;
      }
    }
    m.modulos[y][x] = escuro !== aplicarMascara(x, y, mascara);
  }
}

/**
 * O caminho de volta: da matriz para os códigos.
 *
 * EXISTE PARA O TESTE, e isso é o ponto. Sem câmera não há como provar que o
 * código lê; o que dá para provar é que a matriz gravada contém exatamente os
 * códigos que entraram — o que exercita o ziguezague, a máscara e as posições
 * reservadas de uma vez. `test/qr.test.ts` usa isto, e ele é a única
 * verificação que roda antes de alguém imprimir o cartão.
 */
export function codigosNaMatriz(
  modulos: boolean[][],
  versao: number,
  mascara: number
): Uint8Array {
  const lado = 17 + 4 * versao;
  const base = matrizVazia(lado);
  localizador(base, 0, 0);
  localizador(base, lado - 7, 0);
  localizador(base, 0, lado - 7);
  alinhamento(base, versao);
  temporizacao(base);
  reservarVersao(base, versao);
  reservarFormato(base);

  const [ec, b1, d1, b2, d2] = BLOCOS_M[versao - 1];
  const total = b1 * d1 + b2 * d2 + (b1 + b2) * ec;
  const saida = new Uint8Array(total);
  let indice = 0;
  let bit = 7;
  for (const [x, y] of posicoesDeDados(base)) {
    if (indice >= total) break;
    const cru = modulos[y][x] !== aplicarMascara(x, y, mascara);
    if (cru) saida[indice] |= 1 << bit;
    bit--;
    if (bit < 0) {
      bit = 7;
      indice++;
    }
  }
  return saida;
}

/** A máscara que `gerarQr` escolheu, lida de volta do campo de formato. */
export function mascaraNaMatriz(modulos: boolean[][]): number {
  let informacao = 0;
  for (let i = 0; i < 15; i++) {
    let bit: boolean;
    if (i < 6) bit = modulos[8][i];
    else if (i === 6) bit = modulos[8][7];
    else if (i === 7) bit = modulos[8][8];
    else if (i === 8) bit = modulos[7][8];
    else bit = modulos[14 - i][8];
    if (bit) informacao |= 1 << i;
  }
  for (let mascara = 0; mascara < 8; mascara++) {
    if (informacaoDeFormato(mascara) === informacao) return mascara;
  }
  return -1;
}

/** As quatro penalidades da especificação. Menor é melhor. */
function penalidade(m: Matriz): number {
  const n = m.lado;
  let total = 0;

  const contarCorridas = (ler: (i: number, j: number) => boolean) => {
    for (let i = 0; i < n; i++) {
      let corrida = 1;
      for (let j = 1; j < n; j++) {
        if (ler(i, j) === ler(i, j - 1)) {
          corrida++;
        } else {
          if (corrida >= 5) total += 3 + (corrida - 5);
          corrida = 1;
        }
      }
      if (corrida >= 5) total += 3 + (corrida - 5);
    }
  };
  contarCorridas((i, j) => m.modulos[i][j]);
  contarCorridas((i, j) => m.modulos[j][i]);

  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const a = m.modulos[y][x];
      if (a === m.modulos[y][x + 1] && a === m.modulos[y + 1][x] && a === m.modulos[y + 1][x + 1]) {
        total += 3;
      }
    }
  }

  // O padrão 1:1:3:1:1 com quatro claros de um lado — o desenho que imita um
  // localizador e faz o leitor procurar um canto que não existe.
  const ALVOS = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true],
  ];
  const casa = (ler: (k: number) => boolean, inicio: number, alvo: boolean[]) => {
    for (let k = 0; k < alvo.length; k++) if (ler(inicio + k) !== alvo[k]) return false;
    return true;
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j + 11 <= n; j++) {
      for (const alvo of ALVOS) {
        if (casa(k => m.modulos[i][k], j, alvo)) total += 40;
        if (casa(k => m.modulos[k][i], j, alvo)) total += 40;
      }
    }
  }

  let escuros = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m.modulos[y][x]) escuros++;
  const proporcao = (escuros * 100) / (n * n);
  total += Math.floor(Math.abs(proporcao - 50) / 5) * 10;

  return total;
}

/* ------------------------------------------------------------------ *
 * 5. A porta de entrada
 * ------------------------------------------------------------------ */

export type CodigoQr = {
  /** Módulos do código, sem a zona de silêncio. `true` = escuro. */
  modulos: boolean[][];
  /** Número de módulos por lado. */
  lado: number;
  versao: number;
  /** A máscara escolhida por penalidade. Sai daqui para o teste poder desfazê-la. */
  mascara: number;
};

/**
 * Gera o código. A zona de silêncio **não** está incluída: quem desenha decide,
 * e o SVG abaixo põe os 4 módulos que a especificação exige.
 */
export function gerarQr(texto: string): CodigoQr {
  const versao = menorVersaoPara(paraBytesLatin1(texto).length);
  const lado = 17 + 4 * versao;

  const base = matrizVazia(lado);
  localizador(base, 0, 0);
  localizador(base, lado - 7, 0);
  localizador(base, 0, lado - 7);
  alinhamento(base, versao);
  temporizacao(base);
  reservarVersao(base, versao);
  reservarFormato(base);

  const codigos = codigosDe(texto, versao);

  let melhor: Matriz | null = null;
  let melhorMascara = 0;
  let melhorPenalidade = Number.POSITIVE_INFINITY;
  for (let mascara = 0; mascara < 8; mascara++) {
    const tentativa: Matriz = {
      lado,
      modulos: base.modulos.map(linha => linha.slice()),
      reservados: base.reservados,
    };
    gravarDados(tentativa, codigos, mascara);
    gravarFormato(tentativa, mascara);
    const pontos = penalidade(tentativa);
    if (pontos < melhorPenalidade) {
      melhorPenalidade = pontos;
      melhor = tentativa;
      melhorMascara = mascara;
    }
  }

  return { modulos: melhor!.modulos, lado, versao, mascara: melhorMascara };
}

/** Os 4 módulos de zona de silêncio que a especificação exige em volta. */
export const ZONA_DE_SILENCIO = 4;

export type CoresDoQr = {
  /** Os módulos escuros. Vem de `cor.primary`. */
  modulo: string;
  /** O campo claro. Vem de `cor.bg`. */
  campo: string;
};

/**
 * O SVG.
 *
 * **VETORIAL, e é por isso que o critério de "1200 px no lado" não se aplica**:
 * um SVG imprime na resolução da impressora, seja ela de 300 ou de 2400 dpi. É
 * também o formato que o navegador desenha na tela do telão sem rasterizar.
 *
 * **NUNCA INVERTIDO** (design system §16.9): módulos escuros sobre campo claro.
 * Parte dos leitores de câmera falha com o negativo, e no telão o código
 * continua vivendo num cartão claro justamente por isso.
 *
 * O caminho é UM `<path>` só, com um `M`/`h`/`v`/`h`/`z` por módulo. Um `<rect>`
 * por módulo daria 841 elementos num código versão 5 — o SVG fica quatro vezes
 * maior e alguns programas de impressão engasgam.
 */
export function qrParaSvg(
  texto: string,
  cores: CoresDoQr,
  opcoes: { rotulo?: string } = {}
): string {
  const { modulos, lado } = gerarQr(texto);
  const total = lado + ZONA_DE_SILENCIO * 2;

  let caminho = "";
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      if (!modulos[y][x]) continue;
      caminho += `M${x + ZONA_DE_SILENCIO} ${y + ZONA_DE_SILENCIO}h1v1h-1z`;
    }
  }

  const rotulo = opcoes.rotulo ?? "Codigo do album do casamento";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"`,
    ` width="${total * 8}" height="${total * 8}" shape-rendering="crispEdges"`,
    ` role="img" aria-label="${escapar(rotulo)}">`,
    `<title>${escapar(rotulo)}</title>`,
    `<rect width="${total}" height="${total}" fill="${cores.campo}"/>`,
    `<path d="${caminho}" fill="${cores.modulo}"/>`,
    `</svg>`,
  ].join("");
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
