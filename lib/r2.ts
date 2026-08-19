/**
 * Cloudflare R2 — o layout das chaves e a assinatura das URLs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O LAYOUT ESTÁ FIXADO AQUI E NA MIGRATION 0006. MUDAR DEPOIS É MIGRAÇÃO DE
 * BLOB — copiar objeto por objeto, com o produto no ar, e sem transação
 * (`escopo-core.md` §9). É a mudança mais cara que este produto tem disponível.
 *
 *   e/<evento_id>/m/<midia_id>/t.jpg    miniatura, 400 px, sem EXIF
 *   e/<evento_id>/m/<midia_id>/p.jpg    prévia,  1600 px, sem EXIF   ← a que conta
 *   e/<evento_id>/m/<midia_id>/o.<ext>  original, como veio          ← o que o casal exporta
 *
 * DUAS PROPRIEDADES SAEM DESSE DESENHO, e as duas são o motivo dele:
 *
 * 1. **O `midia_id` só existe depois da linha de intenção.** Logo não pode haver
 *    objeto no R2 sem linha no banco, e a reconciliação (H-15) é um `HEAD` nas
 *    chaves esperadas em vez de uma varredura do balde inteiro (PRD §3.1, V3).
 * 2. **O prefixo `e/<evento_id>/`** deixa a expiração dos 12 meses (Q9) ser
 *    regra de ciclo de vida por prefixo — configuração, não código.
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

/** As três chaves de uma mídia. É a única função que sabe montar caminho no R2. */
export function chavesDaMidia(
  eventoId: string,
  midiaId: string,
  tipoArquivo: string | null
): Record<Faixa, string> {
  const raiz = `e/${eventoId}/m/${midiaId}`;
  return {
    miniatura: `${raiz}/t.jpg`,
    previa: `${raiz}/p.jpg`,
    original: `${raiz}/o.${extensaoDe(tipoArquivo)}`,
  };
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

/* ------------------------------------------------------------------ *
 * A LEITURA — o caminho de volta, e a decisão que o PRD não tinha tomado
 * ------------------------------------------------------------------ */

/**
 * A URL pública de uma faixa. `null` sem `R2_PUBLIC_BASE` configurada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA É UMA DECISÃO DE ARQUITETURA, E ELA ESTÁ ESCRITA EM `docs/adr/0005`.
 * Resumo, porque quem lê este arquivo precisa saber sem abrir outro:
 *
 * O PRD fixa o layout das chaves e nada diz sobre como a mídia é **lida**. As
 * duas saídas eram assinar cada `GET` numa rota nossa, ou servir o balde por um
 * domínio público. A primeira custa **uma invocação de função por miniatura** —
 * e o teto da H-11 é abrir o álbum com 6.000 itens em 3 segundos num Android de
 * 3 anos em 4G. Seis mil invocações por abertura de álbum não chegam perto
 * disso, e nenhuma borda consegue cachear uma URL assinada que muda a cada
 * pedido.
 *
 * O que sustenta a escolha é a chave: `e/<evento_id>/m/<midia_id>/p.jpg`, com
 * dois uuid v4. Adivinhar um é 122 bits de busca; a URL do álbum já é uma
 * credencial ao portador (B14) e o link do telão também. **O que muda de
 * postura é isto, e está declarado:** quem tiver a URL exata de uma foto a vê
 * sem sessão, inclusive uma foto `noivos`. Uma foto `noivos` nunca é listada
 * para ninguém além de quem enviou e do casal — mas a URL dela, se vazar, abre.
 *
 * O ORIGINAL FICA DE FORA. `urlPublica` recusa a faixa `original` de propósito:
 * ele é o arquivo do casal, carrega EXIF (inclusive GPS, RN-18) e nunca é
 * servido numa grade. O download dele é a H-20 (F1.7) e vai por rota assinada,
 * com sessão. Se alguém quiser "só reaproveitar" esta função para o original, o
 * `throw` está aqui para impedir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function urlPublica(
  eventoId: string,
  midiaId: string,
  faixa: "miniatura" | "previa",
  tipoArquivo: string | null = null
): string | null {
  const base = (process.env.R2_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  if (!base) return null;
  const chaves = chavesDaMidia(eventoId, midiaId, tipoArquivo);
  return `${base}/${chaves[faixa]}`;
}

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
export async function assinarPut(
  configuracao: ConfiguracaoR2,
  chave: string,
  agora: Date,
  validadeSegundos: number = VALIDADE_DA_URL_SEGUNDOS
): Promise<string> {
  const base = configuracao.contaOuEndpoint.replace(/\/+$/, "");
  const url = new URL(`${base}/${configuracao.balde}/${chave}`);
  const anfitriao = url.host;

  const carimbo = agora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dia = carimbo.slice(0, 8);
  const escopo = `${dia}/${REGIAO}/${SERVICO}/aws4_request`;

  const consulta = new URLSearchParams({
    "X-Amz-Algorithm": ALGORITMO,
    "X-Amz-Credential": `${configuracao.chaveDeAcesso}/${escopo}`,
    "X-Amz-Date": carimbo,
    "X-Amz-Expires": String(validadeSegundos),
    "X-Amz-SignedHeaders": "host",
  });
  // A AWS exige a consulta ordenada por nome de parâmetro. `URLSearchParams`
  // preserva a ordem de inserção; a ordenação é explícita para não depender de
  // alguém acrescentar um parâmetro no lugar certo daqui a um ano.
  const consultaCanonica = [...consulta.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([nome, valor]) => `${encodeURIComponent(nome)}=${encodeURIComponent(valor)}`)
    .join("&");

  const pedidoCanonico = [
    "PUT",
    codificarCaminho(url.pathname),
    consultaCanonica,
    `host:${anfitriao}\n`,
    "host",
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
 * As três URLs de uma mídia, assinadas de uma vez.
 *
 * UMA REQUISIÇÃO ASSINA O LOTE INTEIRO (`escopo-core.md` §7.4, decisão P3). No
 * uplink do salão, cada ida à rede é uma chance de falhar; assinar arquivo por
 * arquivo multiplicaria essa chance pelo número de fotos, justamente no aparelho
 * que já está com dificuldade.
 */
export async function assinarFaixas(
  configuracao: ConfiguracaoR2,
  eventoId: string,
  midiaId: string,
  tipoArquivo: string | null,
  agora: Date
): Promise<Record<Faixa, string>> {
  const chaves = chavesDaMidia(eventoId, midiaId, tipoArquivo);
  const [miniatura, previa, original] = await Promise.all([
    assinarPut(configuracao, chaves.miniatura, agora),
    assinarPut(configuracao, chaves.previa, agora),
    assinarPut(configuracao, chaves.original, agora),
  ]);
  return { miniatura, previa, original };
}
