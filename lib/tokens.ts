/**
 * casa-nos — fonte única de cor, tipografia, espaço, raio e sombra.
 *
 * Destino no projeto: `lib/tokens.ts`. O tema (seção 6) vive em `lib/theme.ts`
 * e importa daqui. O que NÃO pode é nascer cor nova fora deste arquivo.
 *
 * ---------------------------------------------------------------------------
 * ESTA É A SEGUNDA VERSÃO. A primeira (marfim + vinho #7A3B45, Fraunces +
 * Inter) foi inventada porque não existia marca. Existe: o manual
 * `ID_VISUAL ANA E MAX_OP2.pdf`, 8 páginas. Todo valor de cor e toda família de
 * fonte abaixo saiu de lá, medido no arquivo — não da lembrança de quem olhou.
 *
 * As cores foram lidas dos operadores de preenchimento do próprio PDF e
 * conferidas pixel a pixel na página 04 (PALETA DE CORES). As famílias vieram
 * dos `/BaseFont` embutidos e da página 06 (TIPOGRAFIA).
 *
 * O que o manual NÃO define — estados de erro, foco, contorno de controle,
 * níveis de texto — está marcado abaixo com `DERIVADO`, com o motivo. Nada é
 * derivado sem a régua de contraste passada.
 * ---------------------------------------------------------------------------
 *
 * Regras que este arquivo existe para sustentar (padroes/design-system.md):
 *  - nenhum `#hex`, `rgb()` ou classe de cor do Tailwind em `app/` e `components/`;
 *  - Tailwind só posiciona (flex, grid, gap, p, m, w, h, breakpoints);
 *  - tipografia sempre por variante do MUI, nunca `style={{ fontSize }}`.
 *
 * BASE TIPOGRÁFICA: 16px. `1rem` = 16px reais. O projeto NÃO herda
 * `html { font-size: 14px }`. Não converta valor de design assumindo 14.

 * ---------------------------------------------------------------------------
 * NO PROJETO: este arquivo são as seções 1–5 do `tokens.ts` entregue pelo
 * `lead-design`. A seção 6 (o tema MUI) mora em `lib/theme.ts` e importa daqui.
 * NENHUM VALOR FOI ALTERADO na cópia.
 *
 * A divisão importa: sem o `createTheme` aqui, este módulo não precisa de
 * `"use client"` e pode ser lido também por componente de servidor — é assim
 * que `app/layout.tsx` usa `cor.primaryDark` no `themeColor` do viewport.
 *
 * Este é o ÚNICO arquivo do projeto onde um `#hex` significa alguma coisa. O
 * ESLint proíbe cor literal em `app/` e `components/`, e não aqui, porque aqui
 * é a paleta.
 * ---------------------------------------------------------------------------
 */

/* ------------------------------------------------------------------ *
 * 1. Cor
 *
 * Os quatro nomes do manual (página 04) e onde cada um foi parar:
 *
 *   algodão  #F9F8F5  neutra   → bg
 *   areia    #E2DDCF  neutra   → divider (e base derivada de border)
 *   marinho  #0B3D5E  primária → primary E textPrimary
 *   oliva    #5E7D61  primária → base derivada de success (ver §ESTADO)
 *
 * Secundárias do manual ("sub tons de azul e verde extraídos da natureza do
 * Rio"), com os valores lidos do arquivo:
 *
 *   #6CA6CE céu       → primaryLight
 *   #C5E3F3 céu claro → primaryBg
 *   #00416B marinho vivo → info (é a cor dos números de seção e dos rótulos
 *                          "CORES NEUTRAS", "VERSÃO PRINCIPAL" no manual)
 *   #A79970 dourado   → base derivada de warning
 *   #0C4711 verde escuro → NÃO usado. Motivo em `success`.
 * ------------------------------------------------------------------ */

export const cor = {
  /** MANUAL "marinho". A cor da marca e a cor do texto. Ver decisão D2. */
  primary: "#0B3D5E",
  /** DERIVADO: marinho aprofundado. Pressionado, link, anel de foco. 13.9:1 sobre `bg`. */
  primaryDark: "#062A44",
  /**
   * MANUAL "céu" (secundária). SÓ preenchimento decorativo e hover.
   * 2.48:1 sobre `bg` — proibido como texto e como ícone com significado.
   */
  primaryLight: "#6CA6CE",
  /** MANUAL "céu claro" (secundária). Faixa, chip, item selecionado. */
  primaryBg: "#C5E3F3",

  /**
   * ESTADO — só estado. Verde nunca é decoração.
   *
   * `success` é DERIVADO da oliva do manual (#5E7D61), escurecido até passar
   * 4.5:1. A oliva crua mede 4.32:1 sobre `bg` e reprova como texto.
   * O verde escuro do manual (#0C4711) foi descartado por medida, não por
   * gosto: ele dá 1.04:1 contra o texto marinho — lado a lado com o corpo da
   * página, ninguém vê que mudou de cor. Este tom dá 1.87:1 contra o marinho.
   */
  success: "#456B4A",
  /** DERIVADO: tinta clara do verde. Texto marinho sobre ele: 9.76:1. */
  successBg: "#E9EFE9",
  /** DERIVADO do dourado do manual (#A79970), escurecido: 2.66:1 → 5.02:1. */
  warning: "#7A6A33",
  /** DERIVADO. Texto marinho sobre ele: 9.90:1. */
  warningBg: "#F3EFE1",
  /**
   * DERIVAÇÃO SEM BASE NO MANUAL — e é a única.
   * Não há nenhum vermelho nas 8 páginas. Um produto que envia foto, confirma
   * presença e cobra precisa de "falhou", e falha sem vermelho não é lida.
   * Terracota, para ficar na temperatura da paleta e não parecer alerta de
   * sistema operacional. 6.46:1 sobre `bg`.
   */
  error: "#9B3B2E",
  /** DERIVADO. Texto marinho sobre ele: 9.62:1. */
  errorBg: "#F7E9E5",
  /** MANUAL "marinho vivo" — a cor dos números de seção e dos rótulos. 10.05:1. */
  info: "#00416B",
  /** DERIVADO. Texto marinho sobre ele: 9.68:1. */
  infoBg: "#E4EEF4",

  /** Superfície */
  surface: "#FFFFFF",
  /** MANUAL "algodão". O papel da página. */
  bg: "#F9F8F5",

  /**
   * Texto — 3 níveis.
   * `textPrimary` é o marinho do manual: no corpo das páginas 02 e 06 o texto
   * corrido É marinho, não cinza. 10.73:1 sobre `bg`.
   */
  textPrimary: "#0B3D5E",
  /** DERIVADO: marinho dessaturado, um degrau acima. 6.99:1 sobre `bg`. */
  textSecondary: "#41586A",
  /** DERIVADO: 4.76:1 sobre `bg` — passa em texto normal, pode carregar informação. */
  textHint: "#5A7280",

  /** MANUAL "areia". Hairline entre itens, contorno decorativo, ornamento. */
  divider: "#E2DDCF",
  /**
   * DERIVADO: areia escurecida até 3.50:1 sobre `bg` e 3.71:1 sobre `surface`.
   * Contorno de coisa que se opera (input, botão outlined, checkbox) precisa de
   * 3:1. A areia crua mede 1.28:1 e reprovaria.
   */
  border: "#8C8471",

  /** DERIVADO: véu marinho sobre foto, para texto claro sobre imagem. */
  overlay: "rgba(11, 61, 94, 0.62)",
  /**
   * MANUAL "algodão" — e não branco puro. É o algodão que aparece sobre o
   * marinho nas peças do manual; branco puro ao lado do algodão do fundo
   * denuncia dois brancos na mesma tela. 10.73:1 sobre `primary`.
   */
  onPrimary: "#F9F8F5",
} as const;

/* ------------------------------------------------------------------ *
 * 2. Tipografia
 *
 * O manual (página 06) declara DUAS famílias, e só duas:
 *   TIPOGRAFIA PRINCIPAL  → Cormorant Garamond
 *   TIPOGRAFIA SECUNDÁRIA → Montserrat
 *
 * O PDF também embute Cinzel (Regular e Bold), usada nos títulos de capítulo
 * do próprio manual — "NOSSA ETERNIDADE", "PALETA DE CORES", "MONOGRAMA".
 * Ela NÃO entra no produto: não está declarada na página de tipografia, e as
 * duas peças que são aplicação de marca de verdade (a capa, página 01, e o
 * cartão de fecho, página 08) usam só Cormorant e Montserrat. Cinzel é a
 * mobília do documento, não a marca. Ver decisão D3.
 *
 * As duas estão no `next/font/google`, gratuitas. Nenhuma fonte paga, nenhuma
 * substituição silenciosa.
 * ------------------------------------------------------------------ */

export const fonte = {
  /** Display — Cormorant Garamond (next/font/google), variável `--font-display`. */
  display: 'var(--font-display), "Cormorant Garamond", Georgia, "Times New Roman", serif',
  /** Interface — Montserrat (next/font/google), variável `--font-sans`. */
  sans: 'var(--font-sans), Montserrat, system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export const peso = {
  regular: 400,
  medio: 500,
  semi: 600,
} as const;

/**
 * Números que mudam sozinhos (contagem regressiva, hora).
 * Espalhe em `sx` para travar a largura do dígito e o número não tremer:
 *   <Typography variant="h2" sx={{ ...tipografiaNumeros }}>
 *
 * Continua puxando a SANS, e agora por dois motivos. O primeiro é o de sempre:
 * dígito de largura fixa. O segundo é novo e vale registrar — a Cormorant
 * Garamond tem algarismos de estilo antigo por padrão (o 3, o 4, o 7 e o 9
 * descem abaixo da linha de base). Numa contagem regressiva isso faz o bloco
 * inteiro parecer desalinhado. `lnum` corrige em Montserrat; a Cormorant
 * simplesmente não é usada para número em lugar nenhum do produto.
 *
 * E é o que o manual faz: os números de seção "01".."08" são Montserrat.
 */
export const tipografiaNumeros = {
  fontFamily: fonte.sans,
  fontVariantNumeric: "tabular-nums lining-nums",
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
  letterSpacing: "-0.01em",
} as const;

/* ------------------------------------------------------------------ *
 * 3. Marca — o monograma
 *
 * O manual (página 07) traz UMA versão oficial: a ligadura A&M em marinho.
 * "BRASÃO E ORNAMENTOS: a definir" — não há mais nada aprovado.
 *
 * QUAL ARQUIVO. Dos três PNGs entregues, só `monograma ANAe.png` tem canal
 * alfa de verdade. `monograma ANA.png` e `monograma ANA222.png` vêm com um
 * fundo creme opaco #F3EEE2 chapado — que não é o algodão (#F9F8F5) nem a
 * areia (#E2DDCF). Usar qualquer um dos dois colocaria um TERCEIRO creme na
 * página, visível como um retângulo levemente diferente do fundo. Estão
 * descartados.
 *
 * POR QUE MÁSCARA E NÃO `<img>`. A tinta do PNG é #10345E — parecida com o
 * marinho, mas não igual. Ao lado de um título em `primary` a diferença
 * aparece. Renderizando o arquivo como máscara CSS e pintando o fundo com o
 * token, o monograma passa a ser exatamente `cor.primary`, e o MESMO arquivo
 * serve `cor.onPrimary` quando estiver sobre foto com véu. Um arquivo, dois
 * usos, zero cor fora do token.
 *
 * TAMANHO MÍNIMO, medido e não chutado. O traço mais fino da ligadura mede
 * 1.9% da largura da tinta (23px em 1226px, percentil 5 de 640 travessias).
 * Abaixo de 88px de tinta esse traço cai de 1.7px CSS e some numa tela de
 * densidade 1 — o monograma vira um borrão azul. A tinta ocupa 64.9% da
 * largura do arquivo (o resto é a área de respiro, simétrica, já embutida).
 * Daí o piso de 136px de arquivo. NÃO existe versão reduzida: favicon e ícone
 * de app precisam de um desenho próprio, não deste encolhido.
 * ------------------------------------------------------------------ */

export const monograma = {
  /** Copiar `monograma ANAe.png` para cá. É o único com canal alfa. */
  caminho: "/marca/monograma.png",
  /** Proporção do arquivo inteiro, respiro incluso (1890 × 1417). */
  proporcao: "1890 / 1417",
  /** Fração do arquivo ocupada pela tinta. Só para conferência. */
  fracaoDaTinta: 0.649,
  /** Piso absoluto de largura do arquivo. Abaixo daqui o traço fino some. */
  minimo: 136,
  /** Hero da página pública: 200 no celular, 280 acima de `sm`. */
  hero: { xs: 200, sm: 280 },
  /** Rodapé: o piso, e nada menos. */
  rodape: 136,
} as const;

/* ------------------------------------------------------------------ *
 * 4. Espaço, raio, sombra
 * ------------------------------------------------------------------ */

/** Poucos degraus, de propósito. Em px. */
export const espaco = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  secao: 64,
} as const;

/** Botão 12 e card 16 são DIFERENTES de propósito. Não "corrija". */
export const raio = {
  input: 12,
  botao: 12,
  card: 16,
  folha: 24,
  pilula: 999,
} as const;

/**
 * Três níveis, tingidos de marinho, nunca preto puro.
 * Mudaram de matiz junto com a paleta: sombra marrom sob um card sobre algodão
 * numa página azul-marinho deixa o card sujo. Sombra não é hierarquia.
 */
export const sombra = {
  sm: "0 1px 2px rgba(11, 61, 94, 0.06)",
  md: "0 2px 8px rgba(11, 61, 94, 0.08)",
  lg: "0 8px 24px rgba(11, 61, 94, 0.12)",
} as const;

/** Teto de largura por tipo de conteúdo (regra §5 do padrão da casa). */
export const largura = {
  /** Coluna de leitura: save the date, horários, texto corrido. */
  texto: 640,
  /** Conteúdo com card, mapa, grade de dois. */
  conteudo: 960,
  /** Feed e álbum, quando existirem. */
  app: 1120,
} as const;

/**
 * Traço — espessura de linha, em px, e por que existe um piso por superfície.
 *
 * `hairline` é o filete entre itens numa tela na mão. `controle` é o contorno de
 * algo que se opera e o contorno tracejado do selo "Chegando". `projecao` é o
 * piso da parede: abaixo de 4 px de SINAL (num quadro de 1920×1080) o erro de
 * convergência de um projetor barato transforma uma linha em franja colorida, e
 * um filete de 1 px simplesmente não existe a 3 metros. Por isso a moldura da
 * foto no telão é uma FAIXA, nunca um fio.
 */
export const traco = { hairline: 1, controle: 2, projecao: 8 } as const;

/**
 * Duração de transição, em ms.
 *
 * `padrao` é o teto da régua de acessibilidade (§10.11): 200 ms na tela na mão.
 * `projecao` é a exceção ESCRITA, valendo para a superfície inteira e não para
 * um componente: um corte de 200 ms entre duas fotos numa parede de 3 metros é
 * um estrobo — a área que muda é mil vezes maior e o olho lê como flash. 600 ms
 * de fusão cruzada é o mínimo confortável em projeção de evento.
 * `prefers-reduced-motion` continua mandando: com ele, corte seco, sem fusão.
 */
export const duracao = { rapida: 150, padrao: 200, projecao: 600 } as const;

/**
 * A grade de mídia — um lugar só, quatro telas (feed, minhas fotos, painel de
 * mídias, fila de aprovação).
 *
 * `tileMinimo` = 104 px não é gosto: o alvo de toque mínimo é 44 px, o card
 * carrega dois selos e uma contagem, e num aparelho de 360 px de largura com
 * 16 px de respiro lateral e 8 px de vão sobram 328 px — exatamente três
 * colunas de 104. Abaixo disso a grade cai para duas colunas e o feed de 6.000
 * itens fica longo demais para rolar.
 */
export const grade = {
  tileMinimo: 104,
  vao: espaco.sm,
  /** Miniatura servida na grade (H-07). A prévia de 1600 só ao abrir a foto. */
  miniatura: 400,
} as const;

/* ------------------------------------------------------------------ *
 * 4b. A SUPERFÍCIE DE PROJEÇÃO — o telão do salão
 *
 * ISTO NÃO É MODO ESCURO. Modo escuro continua fora do produto (padrão da casa
 * §13, decisão D13). Modo escuro é uma PREFERÊNCIA do leitor, que liga e
 * desliga, e por isso obriga cada tela a existir duas vezes. Isto é uma
 * SUPERFÍCIE: uma rota só (`/telao/[token]`), sempre assim, sem alternância,
 * sem `prefers-color-scheme`, sem classe `dark:`. Ela existe porque a física da
 * projeção é outra, não porque alguém prefere.
 *
 * O QUE MUDA NA FÍSICA, e o que cada item obriga:
 *
 *  1. Projetor não pinta preto — ele deixa de emitir. O "preto" da parede é a
 *     luz ambiente do salão refletida na tela. Logo o piso de luminância NÃO é
 *     zero, e todo contraste medido num monitor está superestimado ali.
 *  2. Projetor estoura branco. Um campo branco de 3 metros às 23 h ilumina o
 *     salão inteiro, apaga a luz cênica e dói de olhar. O problema é ÁREA, não
 *     brilho: texto claro e fino é ótimo; retângulo claro e grande é farol.
 *  3. Gama alto e contraste ANSI baixo esmagam o meio-tom. Dois tons escuros
 *     vizinhos viram um só. Prova, com o modelo abaixo: `cor.primary` sobre
 *     `fundo` mede 1.47:1 no monitor e 1.26:1 na parede.
 *  4. Sobrevarredura: projetor e TV ainda cortam até 5% da borda. Nada legível
 *     encosta na margem.
 *
 * O MODELO DE DERATING, escrito para poder ser contestado com número.
 * A fórmula da WCAG é (L1+0.05)/(L2+0.05), e o 0.05 modela 5% de véu ambiente
 * num monitor. Em projeção o véu é o preto do projetor MAIS a luz do salão.
 * Adotei k = 0.10 como hipótese de projeto (salão escurecido, com luz cênica),
 * e conferi tudo também em k = 0.15 e k = 0.20 (salão com a pista acesa):
 *
 *     razao_projetada = (L1 + k) / (L2 + k)
 *
 * A RÉGUA DESTA SUPERFÍCIE: 4.5:1 DERATADO em k = 0.15 para texto, 3:1 deratado
 * para o que não é texto. Isso equivale a exigir cerca de 10:1 no monitor — e é
 * exatamente por isso que a paleta da página não serve aqui.
 *
 * DUAS TINTAS NOVAS, E SÓ DUAS: `fundo` e `tintaSuave`. Todo o resto é token da
 * marca reaproveitado. A superfície de projeção não é uma segunda paleta: é a
 * mesma paleta virada do avesso.
 * ------------------------------------------------------------------ */

export const corProjecao = {
  /**
   * O chão da parede. NOVO. Marinho a 203.4° — a mesma matiz de `cor.primary`
   * (203.9°), levado a 1.2% de luminância. Não é preto: preto é inalcançável
   * num projetor, e um campo "preto" chapado só denuncia o piso cinza do
   * aparelho como um retângulo sujo contra a parede em volta. Marinho a 1% some
   * no escuro do salão e continua sendo a cor da marca para quem passa perto.
   */
  fundo: "#051E2E",

  /**
   * A tinta. É o mesmo algodão de `cor.onPrimary` — não branco puro.
   * 16.05:1 no monitor · 9.31:1 em k=.10 · 6.74:1 em k=.15 · 5.38:1 em k=.20.
   * Passa em todos os cenários, inclusive o salão com a pista acesa.
   */
  tinta: "#F9F8F5",

  /**
   * A segunda tinta. NOVO — derivada do "céu" do manual, clareada até passar.
   * 10.45:1 no monitor · 6.22:1 em k=.10 · 4.60:1 em k=.15 · 3.75:1 em k=.20.
   *
   * SÓ PARA TEXTO GRANDE — e no telão todo texto é grande: o piso da superfície
   * é 2.4vw (≈46 px em 1080), muito acima do limiar de "texto grande". Em k=.20
   * ela cai para 3.75:1, e é por isso que NÃO existe uma terceira tinta. São
   * duas, e a segunda já está no limite. Hierarquia aqui se faz com TAMANHO.
   */
  tintaSuave: "#B7CEDC",

  /**
   * Destaque. É o `cor.primaryBg` do manual ("céu claro"), sem alteração.
   * 12.71:1 no monitor · 7.46:1 em k=.10 · 5.46:1 em k=.15.
   * Endereço curto sob o QR e filete. Nunca texto corrido.
   */
  realce: "#C5E3F3",

  /**
   * O cartão claro do QR. É o algodão `cor.bg`.
   * É o único campo claro permitido na parede, e ele tem teto de ÁREA: ver
   * `escalaProjecao.campoClaroMaximo`.
   */
  superficie: "#F9F8F5",

  /**
   * A moldura da foto. É o `cor.primaryLight` — o "céu" do manual, a cor que na
   * PÁGINA é PROIBIDA como texto e como ícone com significado (2.48:1 sobre o
   * algodão). Aqui ela encontra o único uso em que é boa: uma faixa que separa
   * uma foto escura do chão escuro. 6.48:1 no monitor · 4.03:1 em k=.10 ·
   * 3.09:1 em k=.15. Objeto gráfico, régua de 3:1 — passa.
   *
   * O mesmo token, dois papéis opostos, os dois justificados por medida.
   */
  moldura: "#6CA6CE",

  /**
   * Véu sob texto claro em cima de foto. Mais pesado que o da página (0.62)
   * porque o projetor levanta o preto: um véu de 0.62 na parede deixa passar
   * uma foto de céu claro e o texto some.
   */
  veu: "rgba(5, 30, 46, 0.78)",
} as const;

/**
 * A geometria da parede. Tudo em unidade de viewport, porque o telão não tem
 * breakpoint: ele tem UMA proporção (16:9) e um tamanho físico que ninguém
 * controla.
 *
 * DE ONDE SAEM OS NÚMEROS. Tela de 3 m de largura (1,69 m de altura), o mais
 * distante da sala a 15 m. A régua audiovisual de leitura casual pede altura de
 * caixa alta >= distância / 150: 15000 / 150 = 100 mm. Em 1080 linhas de sinal,
 * 100 mm de 1690 mm são 64 px de caixa alta; com a caixa alta da Montserrat a
 * 0.70 em, isso é 92 px de corpo — 4.8vw num quadro de 1920. É esse o tamanho
 * da linha "aponte a câmera", e não uma escolha de gosto.
 */
export const escalaProjecao = {
  /** Sobrevarredura. Nada legível fora daqui. A foto pode sangrar; texto não. */
  margemSegura: "5%",

  /**
   * Piso tipográfico da superfície: 2.4vw (≈46 px em 1080 → 50 mm de caixa alta
   * → legível a 7,5 m). NÃO EXISTE `caption` num telão. Metadado numa parede é
   * ou ilegível ou lixo visual, e nos dois casos não deveria estar lá.
   */
  piso: "2.4vw",

  /**
   * Piso da serifa. A Cormorant é de contraste altíssimo; o traço fino mede
   * cerca de 2.8% do em. A 4vw (77 px em 1080) esse traço dá 2.2 px de sinal —
   * o mínimo que sobrevive ao erro de convergência de um projetor comum.
   * Abaixo de 4vw, no telão, a família é a Montserrat.
   *
   * ESTE É O ÚNICO NÚMERO DESTE ARQUIVO QUE NÃO FOI MEDIDO NO PIXEL: saiu da
   * proporção do desenho da fonte, não de uma projeção real. Está na lista de
   * verificação do ensaio (design-system.md §18).
   */
  pisoDaSerifa: "4vw",

  /**
   * O QR da chamada. 30vw de lado.
   * A regra de campo dos leitores é distância <= 10x o lado do código. 30vw de
   * uma tela de 3 m são 90 cm, portanto leitura confiável até ~9 m — que é onde
   * está quem ainda vai apontar a câmera para a parede. Com uma URL de ~36
   * caracteres o código é versão 3 (29×29 módulos): 576 px de sinal / 29 = 19,8
   * px por módulo, folgadíssimo para a câmera.
   */
  qrLado: "30vw",
  /** Zona de silêncio em volta do código, dentro do cartão claro. */
  qrRespiro: "2.5vw",

  /**
   * Teto de ÁREA de campo claro, como fração da tela projetada.
   * O cartão do QR (30vw + 2.5vw de respiro dos dois lados = 35vw de largura,
   * ~62vh de altura em 16:9) ocupa 21,7% — abaixo do teto. Nenhum outro campo
   * claro entra na parede, e dois campos claros somam.
   */
  campoClaroMaximo: 0.25,

  /** Espessura da moldura da foto, em unidade de viewport (8 px em 1920). */
  moldura: "0.4vw",
} as const;

/** Alvo de toque mínimo no mobile. Não desça daqui. */
export const toque = { minimo: 44, confortavel: 48 } as const;

export const tokens = {
  cor,
  corProjecao,
  fonte,
  peso,
  monograma,
  espaco,
  raio,
  sombra,
  traco,
  duracao,
  grade,
  largura,
  escalaProjecao,
  toque,
} as const;

export type Tokens = typeof tokens;

/* ------------------------------------------------------------------ *
 * 5. Espelho em CSS custom properties
 *    Injetadas no `:root` pelo `MuiCssBaseline`. Prefixo `--cn-`.
 * ------------------------------------------------------------------ */

export const variaveisCss: Record<string, string> = {
  "--cn-primary": cor.primary,
  "--cn-primary-dark": cor.primaryDark,
  "--cn-primary-light": cor.primaryLight,
  "--cn-primary-bg": cor.primaryBg,
  "--cn-success": cor.success,
  "--cn-success-bg": cor.successBg,
  "--cn-warning": cor.warning,
  "--cn-warning-bg": cor.warningBg,
  "--cn-error": cor.error,
  "--cn-error-bg": cor.errorBg,
  "--cn-info": cor.info,
  "--cn-info-bg": cor.infoBg,
  "--cn-surface": cor.surface,
  "--cn-bg": cor.bg,
  "--cn-text-primary": cor.textPrimary,
  "--cn-text-secondary": cor.textSecondary,
  "--cn-text-hint": cor.textHint,
  "--cn-divider": cor.divider,
  "--cn-border": cor.border,
  "--cn-overlay": cor.overlay,
  "--cn-radius-card": `${raio.card}px`,
  "--cn-radius-botao": `${raio.botao}px`,
  "--cn-shadow-sm": sombra.sm,
  "--cn-shadow-md": sombra.md,
  "--cn-shadow-lg": sombra.lg,
  "--cn-monograma": `url(${monograma.caminho})`,
};

/**
 * O espelho da SUPERFÍCIE DE PROJEÇÃO. Prefixo `--cn-proj-`.
 *
 * Não vai para o `:root`. Ele é injetado pelo `PalcoTelao` no escopo da rota
 * `/telao/[token]` — porque essas variáveis não devem existir em nenhuma outra
 * tela, e variável global de outra superfície é convite para alguém pintar um
 * card do painel com a tinta do telão.
 */
export const variaveisCssProjecao: Record<string, string> = {
  "--cn-proj-fundo": corProjecao.fundo,
  "--cn-proj-tinta": corProjecao.tinta,
  "--cn-proj-tinta-suave": corProjecao.tintaSuave,
  "--cn-proj-realce": corProjecao.realce,
  "--cn-proj-superficie": corProjecao.superficie,
  "--cn-proj-moldura": corProjecao.moldura,
  "--cn-proj-veu": corProjecao.veu,
  "--cn-proj-margem-segura": escalaProjecao.margemSegura,
  "--cn-proj-moldura-espessura": escalaProjecao.moldura,
};

export default tokens;
