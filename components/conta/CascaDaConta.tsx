"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { largura } from "@/lib/tokens";

/**
 * A CASCA DAS CINCO TELAS DE CONTA (entrar, criar, pedir senha nova, escolher
 * senha nova, confirmar e-mail).
 *
 * Uma casca só pelo mesmo motivo do editor de seções: cinco telas parecidas
 * escritas cinco vezes viram cinco cabeçalhos diferentes, e a diferença aparece
 * justamente na tela que alguém abre com pressa. Aqui ela também guarda a régua
 * de largura — formulário de duas linhas centralizado numa página de 1.400 px é
 * o erro de layout mais fácil de cometer com um `Container` do MUI.
 *
 * **NENHUMA DELAS TEM O NOME DO CASAL, e nenhuma tem o monograma.** Estas telas
 * são do produto, e não de um casamento: quem abre `/entrar` ainda não é
 * ninguém, e o produto não sabe qual casamento é o dele até a senha conferir.
 */
export function CascaDaConta({
  titulo,
  explicacao,
  erroGeral,
  children,
  rodape,
}: {
  titulo: string;
  explicacao?: string;
  erroGeral?: string | null;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <Box
      component="main"
      sx={{
        maxWidth: largura.texto,
        mx: "auto",
        px: { xs: 2, sm: 3 },
        py: { xs: 4, sm: 8 },
      }}
    >
      <Stack sx={{ gap: 3 }}>
        <Stack sx={{ gap: 1 }}>
          <Typography variant="h3" component="h1">
            {titulo}
          </Typography>
          {explicacao ? <Typography variant="body1">{explicacao}</Typography> : null}
        </Stack>

        {/* A falha que não pertence a nenhum campo — rede, servidor fora, limite
            de tentativas. As que pertencem a um campo vão no `helperText` dele,
            porque um alerta no topo resumindo o que aconteceu embaixo fica fora
            da tela justamente quando a pessoa está no campo errado. */}
        {erroGeral ? <Alert severity="error">{erroGeral}</Alert> : null}

        <Card sx={{ p: { xs: 2, sm: 3 } }}>{children}</Card>

        {rodape}
      </Stack>
    </Box>
  );
}

export default CascaDaConta;
