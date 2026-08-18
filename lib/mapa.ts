import type { MapaPublico } from "@/lib/eventos";

/**
 * A geometria do mapa — separada do componente porque é ARITMÉTICA, e
 * aritmética se prova com teste, não com screenshot.
 *
 * O QUE ESTE ARQUIVO GARANTE: o ponto guardado no banco cai exatamente no centro
 * da área desenhada, em qualquer largura de tela.
 *
 * Como ele garante: tudo aqui é relativo a UMA âncora — o ponto central, que o
 * componente coloca em 50%/50% do contêiner. As tiles são posicionadas por
 * deslocamento em relação a essa âncora, e a área destacada é centrada nela.
 * Como as duas penduram do mesmo prego, elas coincidem por construção. Não há
 * número de ajuste, e portanto não há número para errar quando a tela muda de
 * tamanho.
 *
 * Foi exatamente isso que faltou na primeira versão: o mapa vinha de um iframe
 * de embed do OpenStreetMap, que desenha as tiles numa área e põe a barra de
 * atribuição por baixo, dentro do mesmo documento. O centro geográfico ficava
 * `altura da barra / 2` acima do centro do contêiner, e a barra muda de altura
 * conforme a largura da tela (uma linha no desktop, três em 320px). Em 390px o
 * desvio media 31px, que com raio de 4 km valia cerca de 2 km ao sul — metade da
 * área caindo no mar. Nenhum recorte resolvia: a altura da barra vive num
 * documento de outra origem, que não dá para medir nem estilizar.
 */

export const TAMANHO_TILE = 256;

/** Metros por pixel no equador, no zoom 0, com tile de 256px. */
const METROS_POR_PIXEL_NO_EQUADOR = 156543.03392;

/**
 * Diâmetro que a área destacada deve ter, em pixels.
 *
 * O zoom sai daqui. Só existem zooms inteiros, então o diâmetro final não bate
 * exatamente com o alvo — o que ele garante é que a área caiba com folga na
 * menor largura suportada (320px, onde o mapa mede ~256px) e continue legível
 * na maior.
 */
const DIAMETRO_ALVO_PX = 150;

/** Zoom de rua, para quando o endereço já foi divulgado. */
const ZOOM_EXATO = 16;

/** Quantas tiles para cada lado da central. 1 = malha 3×3. */
const ALCANCE_DA_MALHA = 1;

/**
 * Teto de largura do mapa, em px.
 *
 * Vem da malha: com 3×3 tiles (768px), o ponto central pode cair a até 128px da
 * borda da tile do meio, o que garante 256px de cobertura para cada lado — ou
 * seja, até 512px de largura. Acima disso apareceria vazio na quina. Uma malha
 * 5×5 cobriria 1024px e custaria 25 tiles em vez de 9, numa página que precisa
 * abrir no 4G do ônibus.
 */
export const LARGURA_MAXIMA_MAPA = 400;

export function xDaLongitude(longitude: number, zoom: number): number {
  return ((longitude + 180) / 360) * 2 ** zoom;
}

export function yDaLatitude(latitude: number, zoom: number): number {
  const rad = (latitude * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

/** A volta: de coordenada de tile para longitude/latitude. Usada no teste. */
export function longitudeDoX(x: number, zoom: number): number {
  return (x / 2 ** zoom) * 360 - 180;
}

export function latitudeDoY(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function metrosPorPixel(latitude: number, zoom: number): number {
  return (
    (METROS_POR_PIXEL_NO_EQUADOR * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom
  );
}

/** O zoom inteiro que deixa a área destacada mais perto do diâmetro alvo. */
export function zoomParaORaio(latitude: number, raioMetros: number): number {
  const exato = Math.log2(
    (METROS_POR_PIXEL_NO_EQUADOR *
      Math.cos((latitude * Math.PI) / 180) *
      DIAMETRO_ALVO_PX) /
      (2 * raioMetros)
  );
  return Math.min(18, Math.max(2, Math.round(exato)));
}

export type Tile = {
  chave: string;
  src: string;
  /** Deslocamento em px a partir da âncora (o ponto central, em 50%/50%). */
  x: number;
  y: number;
};

export type Mapa = {
  zoom: number;
  tiles: Tile[];
  /** Diâmetro da área destacada, em px. Zero quando a revelação é exata. */
  diametroDaArea: number;
  /** Para onde o botão "abrir no mapa" leva. */
  linkExterno: string;
  descricao: string;
};

export function montarMapa(mapa: MapaPublico): Mapa {
  const { latitude, longitude, precisao, raioMetros } = mapa;

  const zoom = precisao === "exato" ? ZOOM_EXATO : zoomParaORaio(latitude, raioMetros);

  const totalDeTiles = 2 ** zoom;
  const xCentral = xDaLongitude(longitude, zoom);
  const yCentral = yDaLatitude(latitude, zoom);
  const xiCentral = Math.floor(xCentral);
  const yiCentral = Math.floor(yCentral);

  // Onde o ponto exato cai DENTRO da tile central, em pixels.
  const sobraX = (xCentral - xiCentral) * TAMANHO_TILE;
  const sobraY = (yCentral - yiCentral) * TAMANHO_TILE;

  const tiles: Tile[] = [];
  for (let dy = -ALCANCE_DA_MALHA; dy <= ALCANCE_DA_MALHA; dy++) {
    for (let dx = -ALCANCE_DA_MALHA; dx <= ALCANCE_DA_MALHA; dx++) {
      const ty = yiCentral + dy;
      // Fora dos polos não existe tile; no sentido leste-oeste o mundo dá volta.
      if (ty < 0 || ty >= totalDeTiles) continue;
      const tx = (((xiCentral + dx) % totalDeTiles) + totalDeTiles) % totalDeTiles;
      tiles.push({
        chave: `${dx}:${dy}`,
        src: `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`,
        x: dx * TAMANHO_TILE - sobraX,
        y: dy * TAMANHO_TILE - sobraY,
      });
    }
  }

  /**
   * O link externo acompanha a revelação em DUAS coisas, e as duas importam:
   *
   * - **Zoom**: mostrar o bairro, não a rua. Abrir a região num zoom de rua
   *   entregaria o que o mapa da página esconde.
   * - **Marcador**: `mlat`/`mlon` fazem o OpenStreetMap cravar um pin. Em modo
   *   região isso seria pior que um vazamento — o ponto guardado é o centro
   *   aproximado de uma área de quilômetros, e o pin apontaria com ar de
   *   precisão para um endereço qualquer que não é o do casamento.
   */
  const alvo = `#map=${precisao === "exato" ? 17 : 13}/${latitude}/${longitude}`;

  return {
    zoom,
    tiles,
    diametroDaArea:
      precisao === "exato" ? 0 : (2 * raioMetros) / metrosPorPixel(latitude, zoom),
    linkExterno:
      precisao === "exato"
        ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}${alvo}`
        : `https://www.openstreetmap.org/${alvo}`,
    descricao:
      precisao === "exato"
        ? "Mapa com o local do casamento"
        : "Mapa da região aproximada do casamento, sem o local exato",
  };
}
