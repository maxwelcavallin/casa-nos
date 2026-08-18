"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { MapPin } from "lucide-react";

import { enviarEvento } from "@/lib/analytics";
import type { MapaPublico } from "@/lib/eventos";
import { raio } from "@/lib/tokens";

/**
 * O mapa do local, em dois níveis de revelação — e é o MESMO componente nos
 * dois. No dia em que o casal divulgar o endereço, muda uma palavra no banco e
 * esta tela passa a mostrar pin, endereço e rota. Nenhum deploy.
 *
 * `regiao`: o mapa mostra uma ÁREA destacada e nenhum marcador. O ponto guardado
 * no banco é o centro aproximado de um raio de quilômetros, não o endereço — de
 * propósito, para que nem o código-fonte da página nem o link do mapa permitam
 * inferir o estabelecimento. O convidado descobre para que lado da cidade vai,
 * que é a informação de que ele precisa para escolher hotel e voo.
 *
 * `exato`: pin no lugar certo.
 *
 * SEM CHAVE DE API. O embed do OpenStreetMap não pede credencial nenhuma — o
 * que importa aqui não é só o custo: uma chave do Google Maps num site público
 * é uma chave exposta, com cota que qualquer um pode gastar. A decisão está
 * registrada no README.
 */

type Props = {
  mapa: MapaPublico;
  eventoId: string;
  /** Endereço só existe quando a revelação é `exato` (ver lib/eventos.ts). */
  endereco: string | null;
};

/** Metros por grau de latitude. Constante boa o bastante para desenhar região. */
const METROS_POR_GRAU = 111320;

/**
 * Caixa geográfica em torno do ponto.
 *
 * O fator 2.5 faz o círculo de raio R ocupar ~40% da largura do mapa: perto o
 * suficiente para o convidado reconhecer o bairro, longe o suficiente para a
 * área não virar um endereço.
 */
function caixaAoRedor(latitude: number, longitude: number, raioMetros: number) {
  const meia = (raioMetros * 2.5) / METROS_POR_GRAU;
  // Um grau de longitude encolhe conforme se afasta do equador. Sem o cosseno,
  // a caixa sai esticada no sentido leste-oeste e o círculo desenhado por cima
  // deixa de corresponder ao raio real.
  const meiaLongitude = meia / Math.cos((latitude * Math.PI) / 180);
  return {
    minLon: longitude - meiaLongitude,
    minLat: latitude - meia,
    maxLon: longitude + meiaLongitude,
    maxLat: latitude + meia,
  };
}

export function MapaDoLocal({ mapa, eventoId, endereco }: Props) {
  const { latitude, longitude, precisao, raioMetros } = mapa;
  const caixa = caixaAoRedor(latitude, longitude, precisao === "exato" ? 300 : raioMetros);

  const bbox = `${caixa.minLon},${caixa.minLat},${caixa.maxLon},${caixa.maxLat}`;
  const marcador = precisao === "exato" ? `&marker=${latitude},${longitude}` : "";
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik${marcador}`;

  /**
   * O link externo acompanha a revelação em DUAS coisas, e as duas importam:
   *
   * - **Zoom**: 13 mostra o bairro, 17 mostra a rua. Abrir a região num zoom de
   *   rua entregaria o que o mapa embutido esconde.
   * - **Marcador**: `mlat`/`mlon` fazem o OpenStreetMap cravar um pin. Em modo
   *   região isso seria pior que um vazamento — o ponto guardado é o centro
   *   aproximado de uma área de quilômetros, não o local, e o pin apontaria com
   *   ar de precisão para um endereço qualquer que não é o do casamento.
   */
  const zoom = precisao === "exato" ? 17 : 13;
  const alvo = `#map=${zoom}/${latitude}/${longitude}`;
  const linkExterno =
    precisao === "exato"
      ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}${alvo}`
      : `https://www.openstreetmap.org/${alvo}`;

  return (
    <Stack sx={{ gap: 2 }}>
      <Box
        sx={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: `${raio.card}px`,
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
        }}
      >
        <Box
          component="iframe"
          src={src}
          title={
            precisao === "exato"
              ? "Mapa com o local do casamento"
              : "Mapa da região aproximada do casamento, sem o local exato"
          }
          loading="lazy"
          referrerPolicy="no-referrer"
          sx={{
            width: "100%",
            height: "100%",
            border: 0,
            // O mapa NÃO é arrastável de propósito. Ele é uma ilustração da
            // região, e a área destacada é desenhada por cima em coordenada de
            // tela: se o convidado arrastasse o mapa, o círculo ficaria parado
            // e passaria a marcar o lugar errado. Quem quiser explorar tem o
            // botão abaixo, que abre o mapa de verdade.
            pointerEvents: "none",
          }}
        />

        {precisao === "regiao" && (
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "40%",
              aspectRatio: "1 / 1",
              borderRadius: "50%",
              bgcolor: "primary.light",
              opacity: 0.35,
              border: 2,
              borderColor: "primary.main",
            }}
          />
        )}
      </Box>

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
          enviarEvento("map_opened", { wedding_id: eventoId, map_precision: precisao })
        }
        sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
      >
        {precisao === "exato" ? "Abrir o local no mapa" : "Abrir a região no mapa"}
      </Button>
    </Stack>
  );
}

export default MapaDoLocal;
