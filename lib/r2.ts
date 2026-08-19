/**
 * Cloudflare R2 — o layout das chaves, a assinatura das URLs, e a fronteira de
 * privacidade que separa as duas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O LAYOUT ESTÁ FIXADO AQUI, NA MIGRATION 0006 E NA RN-33. MUDAR DEPOIS É
 * MIGRAÇÃO DE BLOB — copiar objeto por objeto, com o produto no ar, e sem
 * transação (`escopo-core.md` §9). É a mudança mais cara que este produto tem.
 *
 *   pub/e/<evento_id>/m/<midia_id>/t.jpg   miniatura de mídia `feed`
 *   pub/e/<evento_id>/m/<midia_id>/p.jpg   prévia    de mídia `feed`
 *   prv/e/<evento_id>/m/<midia_id>/t.jpg   miniatura de mídia `noivos`
 *   prv/e/<evento_id>/m/<midia_id>/p.jpg   prévia    de mídia `noivos`
 *   prv/e/<evento_id>/m/<midia_id>/o.<ext> ORIGINAL — sempre, em toda visibilidade
 *
 * **OS DOIS PREFIXOS SÃO SEGURANÇA, NÃO ARRUMAÇÃO** (RN-33, decisão do `po` em
 * 19/08/2026). `pub/` é servido por um domínio público; `prv/` não é servido por
 * ninguém sem assinatura de 15 minutos. A consequência que decide o desenho:
 * **uma mídia que vira `noivos` MUDA DE PREFIXO** — os objetos são movidos, e a
 * troca de visibilidade só é confirmada depois de o endereço antigo parar de
 * responder, inclusive na borda (`lib/r2-objetos.ts`).
 *
 * A versão anterior deste arquivo (ADR 0005, primeira redação) servia tudo por
 * base pública e declarava, de olhos abertos, que "quem tiver a URL exata de uma
 * foto `noivos` a vê sem sessão". Isso não podia ficar: o produto imprime na
 * tela **"Só os noivos veem esta foto"**, e a Fatia 1 existe justamente para
 * medir a razão entre os dois botões. Uma promessa que depende de ninguém
 * descobrir a URL é falsa por construção — e mediria uma escolha cuja
 * consequência o produto não cumpre.
 *
 * TRÊS PROPRIEDADES SAEM DESSE DESENHO:
 *
 * 1. **O `midia_id` só existe depois da linha de intenção.** Logo não pode haver
 *    objeto no R2 sem linha no banco, e a reconciliação (H-15) é um `HEAD` nas
 *    chaves esperadas em vez de uma varredura do balde (PRD §3.1, V3).
 * 2. **O prefixo por evento** (`pub/e/<id>/` e `prv/e/<id>/`) deixa a expiração
 *    dos 12 meses (Q9) ser regra de ciclo de vida por prefixo — configuração,
 *    não código. São DUAS regras agora, uma por prefixo, e o README diz isso.
 * 3. **A faixa `original` não tem endereço público em visibilidade nenhuma.**
 *    Ela carrega EXIF, inclusive GPS (RN-18), e nunca é servida numa grade.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * POR QUE ASSINATURA À MÃO E NÃO O SDK DA AWS: `@aws-sdk/client-s3` mais o
 * `s3-request-presigner` somam alguns megabytes de dependência para produzir uma
 * string. Este arquivo faz a mesma string em cem linhas de Web Crypto, roda em
 * Node e na borda sem adaptador, e — o que vale mais — é **testável sem rede**:
 * `test/r2-assinatura.test.ts` confere a URL contra os valores conhecidos do
 * documento da AWS. Um SDK aqui seria uma dependência que ninguém consegue
 * verificar antes do dia da festa.
 */

export type Faixa = "miniatura" | "previa" | "original";

/** As duas visibilidades (RN-03). Repetida aqui para não importar `lib/midias`. */
export type VisibilidadeDaChave = "feed" | "noivos";

/** Os dois prefixos da RN-33. `pub` é servido; `prv` nunca é servido sem assinatura. */
export const PREFIXO_PUBLICO = "pub";
export const PREFIXO_PRIVADO = "prv";

/**
 * As três chaves de uma mídia, no prefixo que a visibilidade dela manda.
 *
 * **É A ÚNICA FUNÇÃO DO PRODUTO QUE SABE MONTAR CAMINHO NO R2**, e por isso ela
 * é a única que sabe a regra dos dois prefixos: derivada segue a visibilidade,
 * original é sempre privada. `test/r2-prefixos.test.ts` varre `lib/` e `app/`
 * atrás de uma segunda montagem de caminho.
 */
export function chavesDaMidia(
  eventoId: string,
  midiaId: string,
  tipoArquivo: string | null,
  visibilidade: VisibilidadeDaChave
): Record<Faixa, string> {
  const derivadas = `${prefixoDeDerivada(visibilidade)}/e/${eventoId}/m/${midiaId}`;
  const original = `${PREFIXO_PRIVADO}/e/${eventoId}/m/${midiaId}`;
  return {
    miniatura: `${derivadas}/t.jpg`,
    previa: `${derivadas}/p.jpg`,
    original: `${original}/o.${extensaoDe(tipoArquivo)}`,
  };
}

/** `feed` → `pub`, `noivos` → `prv`. A regra inteira, num lugar só. */
export function prefixoDeDerivada(visibilidade: VisibilidadeDaChave): string {
  return visibilidade === "feed" ? PREFIXO_PUBLICO : PREFIXO_PRIVADO;
}

/**
 * A extensão do original.
 *
 * Lista fechada, e o resto vira `bin`: a extensão vai para dentro de uma chave
 * de objeto, e o `tipo_arquivo` vem do aparelho — ou seja, é entrada de
 * usuário. Um `image/../../etc` derivando extensão livre seria travessia de
 * caminho dentro do balde.
 *
 * `bin` não quebra nada: o casal baixa o original pela rota de download, que
 * manda o `Content-Type` real e o nome do arquivo no cabeçalho.
 */
export function extensaoDe(tipoArquivo: string | null): string {
  switch ((tipoArquivo ?? "").toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

/** 24 h (PRD §3.2, P10). Ver o comentário em `assinarPut`. */
export const VALIDADE_DA_URL_SEGUNDOS = 24 * 60 * 60;

/**
 * 15 minutos — **a vida curta**, e ela é UM número no produto inteiro.
 *
 * Vale para toda leitura de `prv/`: miniatura e prévia de mídia `noivos`, e o
 * download do original (H-20, que pede exatamente 15 minutos). Um segundo
 * número aqui viraria duas ideias de "curto" e, daqui a um ano, ninguém saberia
 * qual das duas é a promessa.
 */
export const VALIDADE_DA_LEITURA_SEGUNDOS = 15 * 60;

/* ------------------------------------------------------------------ *
 * A LEITURA — dois caminhos, e a fronteira entre eles é a promessa
 * ------------------------------------------------------------------ */

export type ConfiguracaoR2 = {
  contaOuEndpoint: string;
  balde: string;
  chaveDeAcesso: string;
  segredo: string;
};

/**
 * A configuração, ou `null`.
 *
 * `null` e não exceção: sem R2 configurado o produto continua servindo a página
 * do casamento e o painel. O que ele não pode é fingir que assinou — quem chama
 * trata o nulo como 503 com mensagem própria, e não como uma URL quebrada que o
 * aparelho tentaria por horas.
 */
export function configuracaoR2(): ConfiguracaoR2 | null {
  const contaOuEndpoint = process.env.R2_ENDPOINT ?? "";
  const balde = process.env.R2_BUCKET ?? "";
  const chaveDeAcesso = process.env.R2_ACCESS_KEY_ID ?? "";
  const segredo = process.env.R2_SECRET_ACCESS_KEY ?? "";
  if (!contaOuEndpoint || !balde || !chaveDeAcesso || !segredo) return null;
  return { contaOuEndpoint, balde, chaveDeAcesso, segredo };
}

/** O domínio que serve `pub/`. Vazio desliga a leitura pública inteira. */
export function baseDoPublico(): string | null {
  const base = (process.env.R2_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  return base || null;
}

/**
 * O endereço público de uma derivada de mídia `feed`.
 *
 * **SÓ `feed`.** A função recusa `noivos` no tipo e no corpo: quem tentar
 * reaproveitá-la para uma foto privada não compila, e se contornar o tipo,
 * estoura. Não é paranoia — é o defeito exato que a primeira redação do ADR 0005
 * aceitou de olhos abertos, e que este arquivo existe para tornar impossível.
 *
 * O QUE SUSTENTA A BASE PÚBLICA AQUI: o caminho quente. São 200 aparelhos
 * puxando miniatura pelo mesmo uplink de salão, e o teto da H-11 é abrir o álbum
 * com 6.000 itens em 3 s num Android de 3 anos em 4G. URL estável é URL que a
 * borda e o navegador cacheiam; URL assinada muda a cada pedido e não cacheia em
 * lugar nenhum. A chave tem dois uuid v4 — 122 bits — e o balde não tem
 * listagem.
 */
export function urlPublicaDeFeed(
  eventoId: string,
  midiaId: string,
  faixa: "miniatura" | "previa"
): string | null {
  const base = baseDoPublico();
  if (!base) return null;
  const chaves = chavesDaMidia(eventoId, midiaId, null, "feed");
  return `${base}/${chaves[faixa]}`;
}

/**
 * A URL de leitura de uma derivada, **decidida pela visibilidade**.
 *
 * `feed`   → endereço público estável (cacheável, sem sessão).
 * `noivos` → URL assinada de 15 minutos, contra o endpoint S3 do balde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ASSINATURA NÃO É A ÚNICA TRANCA, E NEM É A PRINCIPAL. A principal é que
 * **esta URL só é gerada dentro de uma resposta que já exigiu a sessão certa**:
 * `/api/eventos/[id]/minhas` (a própria participação) e as rotas do painel
 * (`midia.ver.todas`). O feed, o telão e a sondagem nunca chegam aqui com
 * `noivos`, porque a cláusula deles filtra `visibilidade = 'feed'` antes.
 *
 * A assinatura é o que faz a URL não sobreviver ao encaminhamento: 15 minutos
 * depois, o print do endereço colado num grupo não abre nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function urlDeLeitura(
  eventoId: string,
  midiaId: string,
  faixa: "miniatura" | "previa",
  visibilidade: VisibilidadeDaChave,
  agora: Date = new Date()
): Promise<string | null> {
  if (visibilidade === "feed") return urlPublicaDeFeed(eventoId, midiaId, faixa);

  const configuracao = configuracaoR2();
  if (!configuracao) return null;
  const chaves = chavesDaMidia(eventoId, midiaId, null, "noivos");
  return assinarGet(configuracao, chaves[faixa], agora, VALIDADE_DA_LEITURA_SEGUNDOS);
}

/* ------------------------------------------------------------------ *
 * SigV4 — o mínimo, e só o que o R2 usa
 * ------------------------------------------------------------------ */

const ALGORITMO = "AWS4-HMAC-SHA256";
/** O R2 não tem regiões; a assinatura pede uma, e a dele é literalmente `auto`. */
const REGIAO = "auto";
const SERVICO = "s3";

function hex(bytes: ArrayBuffer | Uint8Array): string {
  const vista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let saida = "";
  for (const b of vista) saida += b.toString(16).padStart(2, "0");
  return saida;
}

async function sha256(texto: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
}

async function hmac(chave: Uint8Array, dados: string): Promise<Uint8Array> {
  const importada = await crypto.subtle.importKey(
    "raw",
    chave as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinado = await crypto.subtle.sign(
    "HMAC",
    importada,
    new TextEncoder().encode(dados)
  );
  return new Uint8Array(assinado);
}

/**
 * Codificação de caminho da AWS.
 *
 * `encodeURIComponent` deixa passar `!`, `'`, `(`, `)` e `*`, e a AWS os exige
 * codificados. A barra fica de fora porque separa segmentos. Se isto estiver
 * errado, a assinatura confere no nosso lado e o R2 devolve
 * `SignatureDoesNotMatch` — um erro que parece de credencial e manda quem
 * investiga trocar a chave secreta.
 */
function codificarCaminho(caminho: string): string {
  return caminho
    .split("/")
    .map(segmento =>
      encodeURIComponent(segmento).replace(
        /[!'()*]/g,
        c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join("/");
}

function carimboDe(agora: Date): string {
  return agora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * O núcleo: uma URL assinada para um método e uma chave.
 *
 * `extra` são parâmetros de consulta que entram **na assinatura** — hoje só
 * `response-content-disposition`, que é o que faz o download da H-20 chegar com
 * nome de arquivo. Parâmetro assinado não pode ser trocado por quem tem o link:
 * mandá-lo fora da assinatura deixaria qualquer um reescrever o nome do arquivo
 * que a pessoa baixa.
 */
export async function assinarUrl(
  configuracao: ConfiguracaoR2,
  metodo: "PUT" | "GET" | "HEAD" | "DELETE",
  chave: string,
  agora: Date,
  validadeSegundos: number,
  extra: Record<string, string> = {},
  /**
   * Cabeçalhos que entram na assinatura além do `host`.
   *
   * A AWS exige que **todo** cabeçalho `x-amz-*` esteja assinado — mandar
   * `x-amz-copy-source` fora da assinatura devolve `SignatureDoesNotMatch`, que
   * é um erro que parece de credencial e manda quem investiga trocar a chave
   * secreta. Quem usa isto é a cópia de objeto (`lib/r2-objetos.ts`), que é o
   * mecanismo da RN-33.
   */
  cabecalhos: Record<string, string> = {}
): Promise<string> {
  const base = configuracao.contaOuEndpoint.replace(/\/+$/, "");
  const url = new URL(`${base}/${configuracao.balde}/${chave}`);
  const anfitriao = url.host;

  const carimbo = carimboDe(agora);
  const dia = carimbo.slice(0, 8);
  const escopo = `${dia}/${REGIAO}/${SERVICO}/aws4_request`;

  // `host` sempre primeiro, e a lista ordenada e em minúsculas — a AWS compara
  // a string literal, então uma ordem diferente é uma assinatura diferente.
  const nomesAssinados = ["host", ...Object.keys(cabecalhos).map(n => n.toLowerCase())].sort();

  const consulta = new URLSearchParams({
    ...extra,
    "X-Amz-Algorithm": ALGORITMO,
    "X-Amz-Credential": `${configuracao.chaveDeAcesso}/${escopo}`,
    "X-Amz-Date": carimbo,
    "X-Amz-Expires": String(validadeSegundos),
    "X-Amz-SignedHeaders": nomesAssinados.join(";"),
  });
  // A AWS exige a consulta ordenada por nome de parâmetro. `URLSearchParams`
  // preserva a ordem de inserção; a ordenação é explícita para não depender de
  // alguém acrescentar um parâmetro no lugar certo daqui a um ano.
  const consultaCanonica = [...consulta.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([nome, valor]) => `${encodeURIComponent(nome)}=${encodeURIComponent(valor)}`)
    .join("&");

  const valorDoCabecalho: Record<string, string> = { host: anfitriao };
  for (const [nome, valor] of Object.entries(cabecalhos)) {
    valorDoCabecalho[nome.toLowerCase()] = valor.trim();
  }

  const pedidoCanonico = [
    metodo,
    codificarCaminho(url.pathname),
    consultaCanonica,
    nomesAssinados.map(nome => `${nome}:${valorDoCabecalho[nome]}`).join("\n") + "\n",
    nomesAssinados.join(";"),
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const textoParaAssinar = [
    ALGORITMO,
    carimbo,
    escopo,
    await sha256(pedidoCanonico),
  ].join("\n");

  const codificador = new TextEncoder();
  let chaveDerivada = await hmac(codificador.encode(`AWS4${configuracao.segredo}`), dia);
  chaveDerivada = await hmac(chaveDerivada, REGIAO);
  chaveDerivada = await hmac(chaveDerivada, SERVICO);
  chaveDerivada = await hmac(chaveDerivada, "aws4_request");
  const assinatura = hex(await hmac(chaveDerivada, textoParaAssinar));

  return `${url.origin}${codificarCaminho(url.pathname)}?${consultaCanonica}&X-Amz-Signature=${assinatura}`;
}

/**
 * URL assinada de `PUT` para uma chave.
 *
 * VALIDADE DE 24 HORAS, e é decisão de produto (P10), não de segurança: a fila
 * deste produto dorme a noite inteira e acorda no dia seguinte. Com uma hora de
 * validade — o padrão que todo mundo copia —, a foto de quem ficou sem rede às
 * 23h viraria erro permanente às 00h01, no produto cujo eixo é justamente
 * sobreviver a isso. A renovação existe (repetir o `POST` de intenção devolve
 * URLs novas), mas ela custa uma ida à rede que pode não haver.
 *
 * `UNSIGNED-PAYLOAD` porque o corpo é o arquivo e ele não passa pelo servidor.
 * Assinar o conteúdo exigiria o hash do arquivo inteiro na assinatura — e o
 * arquivo está no celular, não aqui.
 *
 * Só o cabeçalho `host` é assinado. Assinar `content-type` obrigaria o aparelho
 * a mandar exatamente o tipo declarado na intenção, e navegador de celular
 * corrige tipo de arquivo sozinho — a foto passaria a falhar por um cabeçalho
 * que ninguém escreveu.
 */
export function assinarPut(
  configuracao: ConfiguracaoR2,
  chave: string,
  agora: Date,
  validadeSegundos: number = VALIDADE_DA_URL_SEGUNDOS
): Promise<string> {
  return assinarUrl(configuracao, "PUT", chave, agora, validadeSegundos);
}

/** URL assinada de `GET`. É o caminho de tudo que mora em `prv/`. */
export function assinarGet(
  configuracao: ConfiguracaoR2,
  chave: string,
  agora: Date,
  validadeSegundos: number = VALIDADE_DA_LEITURA_SEGUNDOS,
  extra: Record<string, string> = {}
): Promise<string> {
  return assinarUrl(configuracao, "GET", chave, agora, validadeSegundos, extra);
}

/**
 * O download da H-20 — sempre assinado, sempre 15 minutos, sempre com nome.
 *
 * `response-content-disposition` vai DENTRO da assinatura (ver `assinarUrl`), e
 * é ele que faz o navegador salvar em vez de abrir. O nome é montado aqui e não
 * vem do cliente: nome de arquivo vindo do aparelho é entrada de usuário, e ela
 * acabaria dentro de um cabeçalho HTTP.
 */
export async function assinarDownload(
  configuracao: ConfiguracaoR2,
  eventoId: string,
  midiaId: string,
  tipoArquivo: string | null,
  visibilidade: VisibilidadeDaChave,
  faixa: Faixa,
  agora: Date = new Date()
): Promise<string> {
  const chaves = chavesDaMidia(eventoId, midiaId, tipoArquivo, visibilidade);
  const extensao = faixa === "original" ? extensaoDe(tipoArquivo) : "jpg";
  const nome = `casa-nos-${midiaId.slice(0, 8)}.${extensao}`;
  return assinarGet(configuracao, chaves[faixa], agora, VALIDADE_DA_LEITURA_SEGUNDOS, {
    "response-content-disposition": `attachment; filename="${nome}"`,
  });
}

/**
 * As três URLs de uma mídia, assinadas de uma vez — **no prefixo da
 * visibilidade com que ela nasceu**.
 *
 * UMA REQUISIÇÃO ASSINA O LOTE INTEIRO (`escopo-core.md` §7.4, decisão P3). No
 * uplink do salão, cada ida à rede é uma chance de falhar; assinar arquivo por
 * arquivo multiplicaria essa chance pelo número de fotos, justamente no aparelho
 * que já está com dificuldade.
 *
 * O `PUT` continua assinado mesmo para `pub/`: escrever no balde nunca é
 * público. O que `pub/` muda é só a **leitura**.
 */
export async function assinarFaixas(
  configuracao: ConfiguracaoR2,
  eventoId: string,
  midiaId: string,
  tipoArquivo: string | null,
  visibilidade: VisibilidadeDaChave,
  agora: Date
): Promise<Record<Faixa, string>> {
  const chaves = chavesDaMidia(eventoId, midiaId, tipoArquivo, visibilidade);
  const [miniatura, previa, original] = await Promise.all([
    assinarPut(configuracao, chaves.miniatura, agora),
    assinarPut(configuracao, chaves.previa, agora),
    assinarPut(configuracao, chaves.original, agora),
  ]);
  return { miniatura, previa, original };
}
