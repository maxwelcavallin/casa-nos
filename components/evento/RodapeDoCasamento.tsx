import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { dataParaExibir } from "@/lib/datas";
import type { EventoPublico } from "@/lib/eventos";
import { monograma } from "@/lib/tokens";

/**
 * Rodapé — o cartão de fecho do manual, reduzido.
 *
 * O monograma volta aqui, e só aqui: ele aparece duas vezes na página (topo e
 * fecho) e não mais. Um convite não carimba a mesma ligadura a cada seção.
 *
 * No PISO de 136px, que é medida e não estimativa: o traço mais fino da
 * ligadura vale 1.9% da largura da tinta, e abaixo de 88px de tinta ele cai de
 * 1.7px CSS e some numa tela de densidade 1 — o monograma vira um borrão azul.
 * Como a tinta ocupa 64.9% do arquivo (o resto é respiro simétrico já
 * embutido), 88px de tinta são 136px de arquivo. Não desça daqui.
 *
 * `casa-nos` é nome de projeto e continua aparecendo UMA vez, como texto: o
 * nome comercial ainda não está decidido, e marca fechada de produto dentro do
 * convite de um casal seria a marca errada no lugar errado.
 */
export function RodapeDoCasamento({ evento }: { evento: EventoPublico }) {
  return (
    <Stack component="footer" sx={{ gap: 2, py: 6, alignItems: "center" }}>
      <Box
        role="img"
        aria-label={evento.nomeCasal}
        data-monograma
        sx={{
          width: monograma.rodape,
          aspectRatio: monograma.proporcao,
          bgcolor: "primary.main",
          maskImage: `url(${monograma.caminho})`,
          WebkitMaskImage: `url(${monograma.caminho})`,
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
        }}
      />

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
