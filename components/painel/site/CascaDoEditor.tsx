"use client";

import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ArrowLeft } from "lucide-react";

import { FaixaVisaoDono } from "@/components/painel/FaixaVisaoDono";
import { largura, toque } from "@/lib/tokens";

/**
 * A CASCA DE TODO EDITOR DE SEÇÃO (v1.0, V-04 a V-09).
 *
 * Seis editores, um contorno só: voltar, título, uma linha dizendo para que a
 * seção serve, e o selo do dono quando for o caso. Escrever isso seis vezes é
 * como nascem seis cabeçalhos parecidos e nenhum igual — e o botão de voltar é
 * o elemento que mais some quando cada tela desenha o seu.
 *
 * LARGURA TRATADA por teto centralizado (`largura.conteudo`, 960), a medida de
 * formulário do painel. **Mobile primeiro** (RV-18): a Marina edita do celular.
 *
 * O AVISO DE "SEÇÃO DESLIGADA" MORA AQUI, e não em cada editor: o casal que abre
 * o editor de uma seção que ele desligou precisa saber que o que ele escrever
 * não vai ao ar — senão ele escreve, salva, abre o site e não encontra nada.
 */
export function CascaDoEditor({
  eventoId,
  titulo,
  explicacao,
  ehDono,
  ativa,
  children,
}: {
  eventoId: string;
  titulo: string;
  explicacao: string;
  ehDono: boolean;
  ativa: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box component="main" sx={{ minHeight: "100dvh" }}>
      {ehDono ? <FaixaVisaoDono /> : null}

      <Box sx={{ maxWidth: largura.conteudo, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        <Stack sx={{ gap: 3 }}>
          <Stack sx={{ gap: 1 }}>
            <Link
              href={`/painel/${eventoId}/site`}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                alignSelf: "flex-start",
                // 44 px de alvo de toque: um "voltar" que erra o dedo no celular
                // é o pior lugar possível para errar.
                minHeight: toque.minimo,
              }}
            >
              <ArrowLeft size={16} aria-hidden />
              Voltar para o site
            </Link>

            <Typography variant="h3" component="h1">
              {titulo}
            </Typography>
            <Typography variant="body1">{explicacao}</Typography>

            {!ativa ? (
              <Typography variant="body2" sx={{ color: "warning.dark" }}>
                Esta seção está desligada. O que você escrever aqui fica guardado,
                mas não aparece no site enquanto ela não for ligada de volta.
              </Typography>
            ) : null}
          </Stack>

          {children}
        </Stack>
      </Box>
    </Box>
  );
}

export default CascaDoEditor;
