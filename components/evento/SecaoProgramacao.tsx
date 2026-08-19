import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { Momento } from "@/lib/conteudo-do-site";
import { horaParaExibir } from "@/lib/datas";
import { tipografiaNumeros } from "@/lib/tokens";

/**
 * A PROGRAMAÇÃO DO DIA (v1.0, V-08).
 *
 * Existe para tirar "a que horas começa?" do WhatsApp da noiva — é uma das cinco
 * perguntas que ela responde dezenas de vezes (`pesquisa.md` §persona).
 *
 * **MOMENTO SEM HORA NÃO MOSTRA `--:--` NEM `00:00`.** Nulo significa "sem
 * horário anunciado", e a linha mostra um travessão. Um `00:00` seria o site
 * anunciando meia-noite; um `--:--` seria o site dizendo que alguém esqueceu de
 * preencher — quando na verdade "a festa vai até o fim" não tem horário.
 *
 * A HORA É FORMATADA POR `lib/datas.ts`, a partir da string `HH:MM`. Ela **não**
 * passa por `Date` (RV-10): `time` é hora de relógio de parede, e transformá-la
 * em instante traria de volta o bug de três horas.
 *
 * **A SEÇÃO SOME sem momentos** (RV-02).
 */
export function SecaoProgramacao({ momentos }: { momentos: Momento[] }) {
  if (momentos.length === 0) return null;

  return (
    <Stack component="section" sx={{ gap: 2 }}>
      <Typography variant="overline" component="p" sx={{ color: "primary.dark" }}>
        O dia
      </Typography>

      <Card>
        <CardContent>
          <Stack component="ol" sx={{ gap: 2.5, listStyle: "none", p: 0, m: 0 }}>
            {momentos.map(momento => (
              <Stack
                key={momento.id}
                component="li"
                direction="row"
                sx={{ gap: 2, alignItems: "baseline" }}
              >
                <Typography
                  variant="subtitle1"
                  component="p"
                  sx={{
                    color: momento.hora ? "text.primary" : "text.disabled",
                    // Largura fixa para as horas alinharem em coluna. Sem ela,
                    // um "9h" e um "16h30" desalinham a lista inteira.
                    minWidth: 64,
                    ...tipografiaNumeros,
                  }}
                >
                  {momento.hora ? horaParaExibir(momento.hora) : "—"}
                </Typography>

                <Stack sx={{ gap: 0.25, minWidth: 0 }}>
                  <Typography
                    variant="subtitle1"
                    component="h3"
                    sx={{ color: "text.primary", overflowWrap: "anywhere" }}
                  >
                    {momento.titulo}
                  </Typography>
                  {momento.descricao ? (
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                    >
                      {momento.descricao}
                    </Typography>
                  ) : null}
                </Stack>
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default SecaoProgramacao;
