"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { grade } from "@/lib/tokens";

/**
 * O ESTADO VAZIO (design system §16.4) — seis telas.
 *
 * Feed · minhas fotos · painel de mídias · painel da fila · painel de
 * convidados · painel do dia.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A REGRA DAS SEIS: **o estado vazio nunca diz o que não existe.** Ele diz o que
 * aquilo é e oferece a ação que preenche. "Nenhuma foto ainda" nomeia a
 * ausência; "Seja a primeira foto da festa" nomeia a possibilidade — e a
 * diferença entre as duas frases é a diferença entre uma tela que desanima e uma
 * que convida, no exato instante em que a pessoa decide se participa.
 *
 * Dois vazios desta fatia são **boas notícias** (a fila de aprovação vazia, o
 * evento novo) e se desenham como tal: com respiro, sem ícone de alerta, sem cara
 * de tela quebrada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DensidadeDoVazio = "padrao" | "convite";

export type PropriedadesDoVazio = {
  densidade?: DensidadeDoVazio;
  titulo: string;
  corpo?: React.ReactNode;
  /** Terceira linha, menor. Só a densidade `convite` a usa nesta fatia. */
  apoio?: React.ReactNode;
  acao?: React.ReactNode;
  /** Ícone Lucide de 32. **Proibido na densidade `convite`** — ver abaixo. */
  ilustracao?: React.ReactNode;
};

/**
 * A densidade `convite` — a que existe por causa de uma frase do PRD: *"a tela
 * mais importante do produto"*.
 *
 * TRÊS DIFERENÇAS, e cada uma tem motivo:
 *
 * 1. **Título em `h3`** (Cormorant 24). É a única tela do produto em que o vazio
 *    fala com a voz da marca — porque é a única em que o vazio é a mensagem.
 * 2. **Sem ícone.** Um ícone de "nenhuma foto" é um lembrete do que falta,
 *    desenhado no lugar onde deveria estar o convite.
 * 3. **Altura derivada da grade**, e não um número. Ver `ConviteDaGrade` em
 *    `GradeMidias.tsx`: o bloco ocupa exatamente duas linhas de grade, medidas
 *    pelo navegador, para que **nada se mova** quando a primeira foto chegar.
 *
 * E **nada de aquisição** (`escopo-core.md` §11.4): o feed vazio é exatamente
 * onde a tentação aparece, e é onde ela custa mais caro.
 */
export function EstadoVazio({
  densidade = "padrao",
  titulo,
  corpo,
  apoio,
  acao,
  ilustracao,
}: PropriedadesDoVazio) {
  if (densidade === "convite") {
    return (
      <Stack sx={{ gap: 1, justifyContent: "center", minHeight: alturaDeDuasLinhas }}>
        <Typography variant="h3" component="h2">
          {titulo}
        </Typography>
        {corpo ? <Typography variant="body1">{corpo}</Typography> : null}
        {apoio ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {apoio}
          </Typography>
        ) : null}
        {acao}
      </Stack>
    );
  }

  return (
    <Stack
      sx={{
        gap: 1.5,
        alignItems: "center",
        textAlign: "center",
        maxWidth: 360,
        mx: "auto",
        py: 6,
      }}
    >
      {ilustracao ? (
        <Box sx={{ color: "text.secondary", display: "flex" }} aria-hidden>
          {ilustracao}
        </Box>
      ) : null}
      <Typography variant="h5" component="h2">
        {titulo}
      </Typography>
      {corpo ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {corpo}
        </Typography>
      ) : null}
      {acao}
    </Stack>
  );
}

/**
 * Duas linhas de grade, sem fixar 216 px.
 *
 * 216 = 2 × 104 + 8 vale **enquanto** a grade tiver três colunas de 104. Num
 * aparelho estreito ela cai para duas colunas, os tiles ficam mais altos, e o
 * número fixo passa a reservar menos espaço do que o conteúdo vai ocupar — a
 * tela **pula** quando a primeira foto chega, justamente no aparelho mais
 * apertado, que é onde a promessa é mais difícil de cumprir.
 *
 * `ConviteDaGrade` faz a derivação de verdade, com duas células invisíveis
 * dentro da grade real. Este mínimo é o piso para quando o bloco é usado fora
 * dela.
 */
const alturaDeDuasLinhas = `calc(${grade.tileMinimo * 2}px + ${grade.vao}px)`;

export default EstadoVazio;
