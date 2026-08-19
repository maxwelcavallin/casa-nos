import { grade } from "@/lib/tokens";

/**
 * As derivadas — miniatura de 400 px e prévia de 1600 px, na MESMA passagem.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRÊS COISAS ACONTECEM AQUI, E CADA UMA RESOLVE UM ITEM DA H-07:
 *
 * 1. **DOIS OBJETOS NA FAIXA RÁPIDA** (decisão P5). Sem a miniatura, uma grade
 *    de 30 fotos baixa 9 MB de prévias no mesmo uplink que o `escopo-core.md`
 *    §7 aponta como ponto de quebra — e o teto de "abrir o álbum em 3 s com
 *    6.000 itens" fica inalcançável. As duas saem de uma passagem só porque
 *    decodificar a foto é o caro; redimensionar duas vezes a partir do bitmap já
 *    decodificado é barato.
 *
 * 2. **A ROTAÇÃO DO EXIF É APLICADA** (RN-19). `imageOrientation: "from-image"`
 *    entrega o bitmap já girado. Sem isso, a foto tirada na vertical deita no
 *    telão — para 150 pessoas.
 *
 * 3. **NENHUM METADADO EXIF SAI NAS DERIVADAS, INCLUSIVE GPS** (RN-18). E isto
 *    não é uma linha de código: é uma propriedade de como o canvas funciona.
 *    `toBlob` re-codifica a partir dos pixels, e pixels não têm EXIF. O GPS de
 *    onde a foto foi tirada — a casa de quem tirou, se ela mandar uma foto
 *    antiga — nunca chega ao balde na faixa que o feed serve. O ORIGINAL
 *    preserva tudo, de propósito: é o arquivo do casal.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O QUE FALHA AQUI NÃO É ERRO (decisão P12, B8): formato que o navegador não
 * decodifica — HEIC exótico de iPhone antigo é o caso real — devolve `null`. O
 * original sobe direto, a prévia fica pendente de servidor, e o item aparece
 * como "chegando". **Nunca como falha**: a foto está a caminho, só demora mais.
 */

export type Derivadas = {
  miniatura: Blob;
  previa: Blob;
  /** Medidas da PRÉVIA — o arquivo que a página serve. */
  largura: number;
  altura: number;
  /**
   * Medidas do arquivo que a pessoa escolheu, **antes** do redimensionamento.
   *
   * Acrescentadas em V-18, e a razão é uma só: a galeria recusa foto com lado
   * menor abaixo de 800 px (`prd-v1` §4.8.3), e a régua é sobre **a foto**, não
   * sobre a derivada. Uma panorâmica de 4000×900 tem lado menor de 900 e é
   * legítima; a prévia dela mede 1600×360, e uma conferência feita sobre a
   * prévia a recusaria por um número que o redimensionamento produziu.
   *
   * Sai de graça daqui porque o bitmap já está decodificado. A alternativa era
   * decodificar a foto de 12 MB **duas vezes** no celular — que é o custo que
   * este arquivo inteiro existe para não pagar.
   */
  larguraOriginal: number;
  alturaOriginal: number;
};

/** 1600 px no maior lado, ~300 KB (H-07). É a faixa que conta. */
const LADO_DA_PREVIA = 1600;
/** 0.82 é o joelho da curva do JPEG: abaixo aparece artefato em pele. */
const QUALIDADE_DA_PREVIA = 0.82;
const QUALIDADE_DA_MINIATURA = 0.75;

function medidaCabendo(
  largura: number,
  altura: number,
  lado: number
): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= lado) return { largura, altura };
  const escala = lado / maior;
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

async function paraBlob(
  bitmap: ImageBitmap,
  lado: number,
  qualidade: number
): Promise<{ blob: Blob; largura: number; altura: number }> {
  const medida = medidaCabendo(bitmap.width, bitmap.height, lado);
  const tela = document.createElement("canvas");
  tela.width = medida.largura;
  tela.height = medida.altura;

  const pincel = tela.getContext("2d");
  if (!pincel) throw new Error("canvas 2d indisponivel");
  pincel.drawImage(bitmap, 0, 0, medida.largura, medida.altura);

  const blob = await new Promise<Blob | null>(resolver =>
    tela.toBlob(resolver, "image/jpeg", qualidade)
  );
  if (!blob) throw new Error("toBlob devolveu nulo");
  return { blob, largura: medida.largura, altura: medida.altura };
}

export async function gerarDerivadas(arquivo: Blob): Promise<Derivadas | null> {
  try {
    // `from-image` é o que aplica a rotação do EXIF. O padrão (`from-image` em
    // navegador moderno, `none` em alguns) não é confiável, então é explícito.
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });

    const previa = await paraBlob(bitmap, LADO_DA_PREVIA, QUALIDADE_DA_PREVIA);
    const miniatura = await paraBlob(bitmap, grade.miniatura, QUALIDADE_DA_MINIATURA);
    // Lidas ANTES do `close()`: depois dele o bitmap é 0×0 e a conferência de
    // lado mínimo da galeria passaria a recusar tudo.
    const larguraOriginal = bitmap.width;
    const alturaOriginal = bitmap.height;
    bitmap.close();

    return {
      miniatura: miniatura.blob,
      previa: previa.blob,
      largura: previa.largura,
      altura: previa.altura,
      larguraOriginal,
      alturaOriginal,
    };
  } catch {
    /**
     * Não relança, e não registra como erro do produto.
     *
     * O caminho de exceção aqui é um formato exótico, e o desenho já prevê isso:
     * quem chama marca as faixas como `pendente_servidor` e segue com o
     * original. Um `throw` faria o lote inteiro parar por causa de uma foto que
     * o produto sabe tratar.
     */
    return null;
  }
}

/**
 * O sha-256 do conteúdo, calculado no aparelho.
 *
 * De-duplica reenvio por precaução — que é a atitude certa quando a alternativa
 * é perder. A pessoa que não tem certeza de que a foto foi manda de novo, e o
 * servidor devolve a mídia que já existe em vez de criar outra (H-06).
 *
 * Sobre o arquivo INTEIRO, e não sobre a prévia: é o original que identifica a
 * foto. Duas prévias geradas em passagens diferentes podem diferir por um bit de
 * compressão, e aí a de-duplicação não deduplicaria nada.
 */
export async function hashDoArquivo(arquivo: Blob): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  const digerido = await crypto.subtle.digest("SHA-256", bytes);
  let saida = "";
  for (const b of new Uint8Array(digerido)) saida += b.toString(16).padStart(2, "0");
  return saida;
}
