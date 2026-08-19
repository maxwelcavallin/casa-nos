import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { Pergunta } from "@/lib/conteudo-do-site";
import { paragrafos } from "@/lib/texto";

/**
 * PERGUNTAS FREQUENTES (v1.0, V-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * As cinco que a Marina responde trinta vezes: **traje, horário, como chegar,
 * tem estacionamento, pode levar criança** (`pesquisa.md` §persona). Esta seção
 * existe para tirá-las do WhatsApp dela.
 *
 * **A LISTA QUE CHEGA AQUI JÁ VEM FILTRADA** (`perguntasRespondidas`): pergunta
 * sem resposta não renderiza, e o texto dela **não viaja no HTML**. Filtrar
 * dentro deste componente deixaria as perguntas sugeridas e não respondidas no
 * código-fonte da página — e é justamente essa garantia que torna seguro sugerir
 * as cinco (V-16).
 *
 * **A SEÇÃO SOME quando nenhuma foi respondida** (RV-02).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function SecaoPerguntas({ perguntas }: { perguntas: Pergunta[] }) {
  if (perguntas.length === 0) return null;

  return (
    <Stack component="section" sx={{ gap: 2 }}>
      <Typography variant="overline" component="p" sx={{ color: "primary.dark" }}>
        Perguntas frequentes
      </Typography>

      <Card>
        <CardContent>
          <Stack divider={<Divider />} sx={{ gap: 0 }}>
            {perguntas.map((item, indice) => (
              <Stack
                key={item.id}
                sx={{
                  gap: 0.75,
                  pt: indice === 0 ? 0 : 2,
                  pb: indice === perguntas.length - 1 ? 0 : 2,
                }}
              >
                <Typography
                  variant="subtitle1"
                  component="h3"
                  sx={{ color: "text.primary", overflowWrap: "anywhere" }}
                >
                  {item.pergunta}
                </Typography>
                {/* Texto puro, com parágrafo por linha em branco (RV-07). */}
                {paragrafos(item.resposta ?? "").map((bloco, i) => (
                  <Typography
                    key={i}
                    variant="body2"
                    sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                  >
                    {bloco}
                  </Typography>
                ))}
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default SecaoPerguntas;
