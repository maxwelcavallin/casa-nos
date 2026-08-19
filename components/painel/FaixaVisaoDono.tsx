"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Eye } from "lucide-react";

/**
 * "Visão do dono" — o selo que torna o privilégio visível.
 *
 * O padrão da casa é explícito: perfil que ignora a matriz precisa aparecer na
 * INTERFACE, não ficar escondido no código. Aqui o `dono` não ignora a matriz —
 * ele tem uma linha a mais (`medicao.ver`) e continua sem poder mexer na
 * visibilidade de foto nenhuma —, mas ele vê o painel do casal, e quem olha a
 * tela precisa saber que está vendo o que o casal vê, e não o que ele mesmo tem.
 *
 * NÃO É FECHÁVEL, e não rola para fora da tela: um selo que some é um selo que
 * não cumpre a função. `sticky` no topo, em todas as telas do painel quando a
 * sessão for `dono`, e em nenhuma outra situação.
 */
export function FaixaVisaoDono() {
  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        bgcolor: "action.selected",
        color: "text.primary",
        px: 2,
        py: 0.5,
        mb: 2,
      }}
    >
      <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
        <Eye size={16} aria-hidden />
        <Typography variant="caption">Visão do dono</Typography>
      </Stack>
    </Box>
  );
}
