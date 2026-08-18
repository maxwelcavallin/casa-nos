import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { largura } from "@/lib/tokens";

/**
 * Não encontrado.
 *
 * Quem cai aqui é quase sempre o convidado que digitou o endereço errado no
 * celular — então a mensagem é específica ("este endereço não é de nenhum
 * casamento") e traz o caminho de saída que ele de fato tem: perguntar a quem
 * mandou o convite. Não há barra de navegação nesta fatia, então oferecer
 * "voltar ao início" seria mandá-lo para um lugar que não existe.
 */
export default function NaoEncontrado() {
  return (
    <Box
      component="main"
      sx={{ maxWidth: largura.texto, mx: "auto", px: { xs: 2, sm: 3 }, py: 8 }}
    >
      <Stack sx={{ gap: 2, alignItems: "center", textAlign: "center" }}>
        <Typography variant="overline" component="p" sx={{ color: "primary.dark" }}>
          Não encontrado
        </Typography>
        <Typography variant="h2" component="h1" sx={{ color: "text.primary" }}>
          Este endereço não é de nenhum casamento
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          Confira o link do convite — um caractere trocado já leva para cá. Se
          ele estiver certo, peça o endereço de novo a quem convidou você.
        </Typography>
      </Stack>
    </Box>
  );
}
