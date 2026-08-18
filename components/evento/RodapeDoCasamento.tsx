import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { dataParaExibir } from "@/lib/datas";
import type { EventoPublico } from "@/lib/eventos";

/**
 * Rodapé.
 *
 * O nome do produto aparece UMA vez, como texto, e não como logotipo: o nome
 * comercial ainda não está decidido pelo `pmm`, e uma marca fechada aqui teria
 * que ser refeita — ou pior, ficaria.
 */
export function RodapeDoCasamento({ evento }: { evento: EventoPublico }) {
  return (
    <Stack component="footer" sx={{ gap: 2, py: 6, alignItems: "center" }}>
      <Divider flexItem />
      <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>
        {evento.nomeCasal} · {dataParaExibir(evento.dataEvento)} ·{" "}
        {evento.cidade}, {evento.uf}
      </Typography>
      {/* `text.disabled` é onde `cor.textHint` mora no tema — o MUI só tem três
          papéis de texto, e `hint` do design system é o terceiro deles. Não é
          texto desabilitado; é metadado. */}
      <Typography variant="caption" sx={{ color: "text.disabled" }}>
        feito com casa-nos
      </Typography>
    </Stack>
  );
}

export default RodapeDoCasamento;
