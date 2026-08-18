"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { MapPin } from "lucide-react";

import { enviarEvento } from "@/lib/analytics";
import type { MapaPublico } from "@/lib/eventos";
import { LARGURA_MAXIMA_MAPA, montarMapa, TAMANHO_TILE } from "@/lib/mapa";
import { cor, raio, toque } from "@/lib/tokens";

/**
 * O mapa do local, em dois níveis de revelação — e é o MESMO componente nos
 * dois. No dia em que o casal divulgar o endereço, muda uma palavra no banco e
 * esta tela passa a mostrar pin e endereço. Nenhum deploy.
 *
 * `regiao`: área destacada, nenhum marcador. O ponto guardado no banco é o
 * centro aproximado de um raio de quilômetros, não o endereço — de propósito,
 * para que nem o código-fonte da página nem o link do mapa permitam inferir o
 * estabelecimento.
 *
 * A GEOMETRIA NÃO MORA AQUI: está em `lib/mapa.ts`, com teste próprio. Este
 * arquivo só desenha. A separação existe porque a centralização da área é
 * aritmética — e aritmética se prova com teste, não olhando a tela.
 *
 * POR QUE TILES E NÃO O IFRAME DE EMBED DO OSM: a primeira versão usava
 * `export/embed.html` com a área desenhada no centro do contêiner, e ela
 * apontava para o lugar errado — o embed reserva parte da própria altura para a
 * barra de atribuição, então o centro geográfico ficava acima do centro do
 * contêiner, e a barra muda de altura com a largura da tela. Ver `lib/mapa.ts`
 * para a medição e o motivo de nenhum recorte resolver.
 *
 * De quebra some a interface de outro produto de dentro do convite: os botões
 * +/− do OSM, que apareciam com ~30px e não faziam nada porque o iframe não
 * recebia toque, e a barra de atribuição, que ocupava 19% do quadrado no celular
 * pedindo doação. O crédito da licença **continua cumprido** — virou texto
 * nosso, abaixo do mapa, com link que funciona.
 */

type Props = {
  mapa: MapaPublico;
  eventoId: string;
  /** Endereço só existe quando a revelação é `exato` (ver lib/eventos.ts). */
  endereco: string | null;
};

export function MapaDoLocal({ mapa, eventoId, endereco }: Props) {
  const { tiles, diametroDaArea, linkExterno, descricao } = montarMapa(mapa);
  const ehRegiao = mapa.precisao === "regiao";

  return (
    <Stack sx={{ gap: 2 }}>
      <Box
        // `role="img"` com `aria-label`: para quem usa leitor de tela isto é uma
        // figura com legenda, e não uma malha de nove imagens soltas.
        role="img"
        aria-label={descricao}
        data-mapa
        sx={{
          position: "relative",
          width: "100%",
          maxWidth: LARGURA_MAXIMA_MAPA,
          mx: "auto",
          aspectRatio: "1 / 1",
          borderRadius: `${raio.card}px`,
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
          // Fundo enquanto as tiles não chegam. Sem ele o quadrado pisca branco
          // no 4G — e branco puro não é cor desta página.
          //
          // Vem do token e não de um papel do tema porque `primaryBg` não tem
          // entrada na paleta do MUI (ela só tem main/dark/light/contrastText).
          // Escrever "primary.bg" no `sx` não daria erro nenhum: simplesmente
          // não pintaria, que é o jeito mais silencioso de um estilo sumir.
          bgcolor: cor.primaryBg,
        }}
      >
        {tiles.map(tile => (
          <Box
            key={tile.chave}
            component="img"
            src={tile.src}
            alt=""
            aria-hidden
            /**
             * SEM `loading="lazy"`, e isso foi medido, não suposto.
             *
             * Com lazy, o navegador carregava 1 das 9 tiles — e a que faltava
             * incluía a do centro, justamente a que o convidado olha. As tiles
             * são posicionadas em absoluto e a maior parte de cada uma fica
             * fora da caixa, cortada pelo `overflow: hidden`; a heurística de
             * interseção do lazy não as considera visíveis, e elas nunca eram
             * pedidas. O mapa ficava um quadrado bege com um círculo em cima.
             *
             * São 9 imagens de ~15KB que FORMAM a informação da seção, não um
             * extra opcional. O que elas não podem é competir com o hero — daí
             * a prioridade baixa e a decodificação assíncrona.
             */
            decoding="async"
            fetchPriority="low"
            draggable={false}
            // As tiles e a área destacada penduram no MESMO ponto (50%/50%), e é
            // daí que vem a centralização em qualquer largura: por construção,
            // não por ajuste.
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              marginLeft: `${tile.x}px`,
              marginTop: `${tile.y}px`,
              width: TAMANHO_TILE,
              height: TAMANHO_TILE,
              maxWidth: "none",
              userSelect: "none",
            }}
          />
        ))}

        {ehRegiao ? (
          <Box
            aria-hidden
            data-area-da-regiao
            sx={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: `${diametroDaArea}px`,
              height: `${diametroDaArea}px`,
              borderRadius: "50%",
              bgcolor: "primary.light",
              opacity: 0.4,
              border: 2,
              borderColor: "primary.main",
            }}
          />
        ) : (
          <Box
            aria-hidden
            data-pin-do-local
            sx={{
              position: "absolute",
              left: "50%",
              top: "50%",
              // A ponta do pin é embaixo: ele sobe a própria altura para que a
              // ponta, e não o meio do desenho, caia sobre o ponto.
              transform: "translate(-50%, -100%)",
              color: "primary.main",
              display: "flex",
            }}
          >
            <MapPin size={36} fill="currentColor" strokeWidth={1.5} />
          </Box>
        )}
      </Box>

      {/*
        CRÉDITO DA LICENÇA — obrigatório, e agora vivo.
        Antes ele existia dentro do iframe, em azul e rosa que não são desta
        página, com os links mortos porque o embed não recebia toque. Cumprir a
        licença exige o crédito legível e o link funcionando; não exige que ele
        seja o widget do OpenStreetMap.
      */}
      <Typography variant="caption" sx={{ color: "text.disabled" }}>
        Mapa ©{" "}
        <Link
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          variant="caption"
        >
          colaboradores do OpenStreetMap
        </Link>
      </Typography>

      {endereco && (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {endereco}
        </Typography>
      )}

      <Button
        variant="outlined"
        href={linkExterno}
        target="_blank"
        rel="noopener noreferrer"
        startIcon={<MapPin size={18} aria-hidden />}
        onClick={() =>
          enviarEvento("map_opened", {
            wedding_id: eventoId,
            map_precision: mapa.precisao,
          })
        }
        sx={{
          alignSelf: { xs: "stretch", sm: "flex-start" },
          minHeight: toque.confortavel,
        }}
      >
        {ehRegiao ? "Abrir a região no mapa" : "Abrir o local no mapa"}
      </Button>
    </Stack>
  );
}

export default MapaDoLocal;
