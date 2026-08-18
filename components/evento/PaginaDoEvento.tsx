import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { HeroDoCasamento } from "@/components/evento/HeroDoCasamento";
import { RodapeDoCasamento } from "@/components/evento/RodapeDoCasamento";
import { SecaoIndicacoes } from "@/components/evento/SecaoIndicacoes";
import { SecaoOnde } from "@/components/evento/SecaoOnde";
import type { EventoPublico, Indicacao } from "@/lib/eventos";
import { largura } from "@/lib/tokens";

/**
 * A página do casamento, montada. Um componente só, usado pelas duas rotas que
 * resolvem o evento (`/` pelo domínio, `/e/[slug]` pelo slug) — as rotas
 * decidem QUAL evento; esta decide como ele aparece.
 *
 * LARGURA TRATADA por teto centralizado: `largura.texto` (640) com `mx: "auto"`.
 * Sem teto, o `h1` do nome do casal estica 1900px num monitor e a linha fica
 * ilegível. É a regra §5 do padrão da casa, na forma que cabe a uma coluna de
 * leitura.
 *
 * MOBILE PRIMEIRO, e não por gosto: o convidado chega de um link no WhatsApp,
 * no celular, com uma mão. O desktop é o caso secundário.
 *
 * NÃO HÁ ESTADO DE CARREGAMENTO nesta página, e a ausência é deliberada: tudo é
 * renderizado no servidor, com os dados já em mãos. Não existe busca no cliente
 * que possa ficar pendurada, e portanto não existe esqueleto — um `Skeleton`
 * aqui seria enfeite que nunca aparece. Se a Fatia 1 trouxer busca no cliente, o
 * esqueleto entra junto com ela.
 */
export function PaginaDoEvento({
  evento,
  indicacoes,
  agoraMs,
}: {
  evento: EventoPublico;
  indicacoes: Indicacao[];
  agoraMs: number;
}) {
  return (
    <>
      <GoogleAnalytics eventoId={evento.id} />
      <Box
        component="main"
        sx={{
          maxWidth: largura.texto,
          mx: "auto",
          px: { xs: 2, sm: 3 },
          pb: 4,
        }}
      >
        <Stack sx={{ gap: { xs: 6, md: 8 } }}>
          <HeroDoCasamento evento={evento} agoraMs={agoraMs} />
          <SecaoOnde evento={evento} />
          <SecaoIndicacoes indicacoes={indicacoes} eventoId={evento.id} />
          <RodapeDoCasamento evento={evento} />
        </Stack>
      </Box>
    </>
  );
}

export default PaginaDoEvento;
