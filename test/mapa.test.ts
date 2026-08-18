import { describe, expect, it } from "vitest";

import type { MapaPublico } from "@/lib/eventos";
import {
  LARGURA_MAXIMA_MAPA,
  latitudeDoY,
  longitudeDoX,
  metrosPorPixel,
  montarMapa,
  TAMANHO_TILE,
  xDaLongitude,
  yDaLatitude,
} from "@/lib/mapa";

/**
 * A ÁREA DESTACADA CAI SOBRE O PONTO GUARDADO — em qualquer largura de tela.
 *
 * POR QUE ESTE ARQUIVO EXISTE: a versão anterior do mapa errava o alvo em cerca
 * de 2 km, e errava DIFERENTE em cada largura, porque o centro geográfico do
 * embed do OpenStreetMap não coincidia com o centro do contêiner onde a área era
 * desenhada. Não dava para ver isso lendo o código — só medindo a tela.
 *
 * O que segura agora não é olhar de novo: é o fato de as tiles e a área
 * penderem da MESMA âncora, e este arquivo prova a aritmética disso. A conferida
 * no navegador continua valendo para o que é visual; a centralização virou
 * conta, e conta tem teste.
 */

const REGIAO: MapaPublico = {
  latitude: -22.97,
  longitude: -43.37,
  precisao: "regiao",
  raioMetros: 4000,
};

const EXATO: MapaPublico = {
  latitude: -22.97,
  longitude: -43.37,
  precisao: "exato",
  raioMetros: 300,
};

const PARTES_DA_TILE = /\/(\d+)\/(\d+)\/(\d+)\.png$/;

describe("projeção — a ida e a volta batem", () => {
  it("longitude e latitude sobrevivem ao percurso até coordenada de tile", () => {
    for (const zoom of [11, 13, 16]) {
      for (const [lat, lon] of [
        [-22.97, -43.37],
        [-23.55, -46.63],
        [0, 0],
        [51.5, -0.12],
        [-33.86, 151.2],
      ]) {
        expect(longitudeDoX(xDaLongitude(lon, zoom), zoom)).toBeCloseTo(lon, 9);
        expect(latitudeDoY(yDaLatitude(lat, zoom), zoom)).toBeCloseTo(lat, 9);
      }
    }
  });
});

describe("a âncora do mapa é exatamente o ponto guardado", () => {
  /**
   * Esta é a prova de que a área fica centrada, e ela não depende de largura
   * nenhuma — que é o ponto.
   *
   * O componente coloca a âncora em 50%/50% do contêiner, e cada tile é
   * desenhada deslocada de (x, y) a partir dela. Então: pegar qualquer tile,
   * desfazer o deslocamento e converter de volta para coordenada geográfica tem
   * que cair no ponto original. Se caísse noutro lugar, a área desenhada sobre a
   * âncora estaria marcando esse outro lugar — que é exatamente o defeito
   * anterior.
   */
  it("reconstruir a posição a partir de QUALQUER tile devolve o ponto original", () => {
    const { tiles, zoom } = montarMapa(REGIAO);
    expect(tiles).toHaveLength(9);

    for (const tile of tiles) {
      const partes = tile.src.match(PARTES_DA_TILE);
      expect(partes, `tile com src inesperado: ${tile.src}`).not.toBeNull();

      const [, zoomDaTile, xDaTile, yDaTile] = partes!.map(Number);
      expect(zoomDaTile).toBe(zoom);

      // Canto superior esquerdo da tile, em pixels do mundo, menos o
      // deslocamento com que ela é desenhada = a âncora.
      const ancoraX = xDaTile * TAMANHO_TILE - tile.x;
      const ancoraY = yDaTile * TAMANHO_TILE - tile.y;

      expect(longitudeDoX(ancoraX / TAMANHO_TILE, zoom)).toBeCloseTo(
        REGIAO.longitude,
        6
      );
      expect(latitudeDoY(ancoraY / TAMANHO_TILE, zoom)).toBeCloseTo(
        REGIAO.latitude,
        6
      );
    }
  });

  it("a tile central cobre a âncora — o deslocamento dela é menor que uma tile", () => {
    const { tiles } = montarMapa(REGIAO);
    const central = tiles.find(t => t.chave === "0:0")!;
    expect(Math.abs(central.x)).toBeLessThan(TAMANHO_TILE);
    expect(Math.abs(central.y)).toBeLessThan(TAMANHO_TILE);
    // Ela começa em cima e à esquerda da âncora, nunca depois dela.
    expect(central.x).toBeLessThanOrEqual(0);
    expect(central.y).toBeLessThanOrEqual(0);
  });

  it("a malha cobre o teto de largura do mapa nas duas direções", () => {
    // A garantia da malha 3×3 é 256px de cobertura para cada lado da âncora, no
    // pior caso. Se o teto de largura subir sem a malha crescer, aparece um
    // vazio na quina — e isto quebra antes de alguém ver na tela.
    const { tiles } = montarMapa(REGIAO);
    const esquerda = Math.min(...tiles.map(t => t.x));
    const direita = Math.max(...tiles.map(t => t.x)) + TAMANHO_TILE;
    const topo = Math.min(...tiles.map(t => t.y));
    const base = Math.max(...tiles.map(t => t.y)) + TAMANHO_TILE;

    const metade = LARGURA_MAXIMA_MAPA / 2;
    expect(-esquerda).toBeGreaterThanOrEqual(metade);
    expect(direita).toBeGreaterThanOrEqual(metade);
    expect(-topo).toBeGreaterThanOrEqual(metade);
    expect(base).toBeGreaterThanOrEqual(metade);
  });
});

describe("a área destacada corresponde ao raio guardado", () => {
  it("o diâmetro em pixels é o raio real convertido pela escala do zoom", () => {
    const { diametroDaArea, zoom } = montarMapa(REGIAO);
    const esperado = (2 * REGIAO.raioMetros) / metrosPorPixel(REGIAO.latitude, zoom);
    expect(diametroDaArea).toBeCloseTo(esperado, 6);
  });

  it("cabe na menor largura suportada (o mapa mede ~256px numa tela de 320px)", () => {
    expect(montarMapa(REGIAO).diametroDaArea).toBeLessThan(256);
  });

  it("raio maior escolhe um zoom mais afastado, não um círculo gigante", () => {
    const largo = montarMapa({ ...REGIAO, raioMetros: 16000 });
    const estreito = montarMapa({ ...REGIAO, raioMetros: 1000 });
    expect(largo.zoom).toBeLessThan(estreito.zoom);
    for (const m of [largo, estreito]) {
      expect(m.diametroDaArea).toBeLessThan(256);
    }
  });
});

describe("o que a revelação muda", () => {
  it("região: zoom de bairro, e nenhum pin no link externo", () => {
    const { zoom, linkExterno, descricao } = montarMapa(REGIAO);
    expect(zoom).toBeLessThanOrEqual(13);
    expect(linkExterno).not.toContain("mlat");
    expect(descricao).toMatch(/sem o local exato/);
  });

  it("exato: zoom de rua, pin no link externo e nenhuma área desenhada", () => {
    const { zoom, linkExterno, diametroDaArea } = montarMapa(EXATO);
    expect(zoom).toBe(16);
    expect(linkExterno).toContain("mlat");
    expect(diametroDaArea).toBe(0);
  });

  it("todas as tiles vêm do OpenStreetMap e do mesmo zoom", () => {
    for (const mapa of [REGIAO, EXATO]) {
      const { tiles, zoom } = montarMapa(mapa);
      for (const tile of tiles) {
        expect(tile.src).toMatch(
          new RegExp(`^https://tile\\.openstreetmap\\.org/${zoom}/\\d+/\\d+\\.png$`)
        );
      }
    }
  });
});
