import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { MapaDoLocal } from "@/components/evento/MapaDoLocal";
import { horaParaExibir } from "@/lib/datas";
import type { EventoPublico } from "@/lib/eventos";

/**
 * "Onde" — a seção que hoje conta menos do que vai contar depois.
 *
 * O casal ainda não divulga o local nem o horário. Isso NÃO é um estado de erro
 * e não vira um card com traço no lugar do texto: a seção diz o que se sabe (a
 * cidade), diz honestamente o que falta, e mostra a região no mapa quando ela
 * existe.
 *
 * Cada peça aparece por conta própria, lida do banco:
 *   nome do local  → `local_nome_publicado`
 *   mapa/endereço  → `local_revelacao`
 *   horário        → `hora_publicada`
 *
 * Revelar qualquer uma delas é um UPDATE. Nenhuma delas passa por deploy, e
 * nenhuma delas depende das outras.
 */
export function SecaoOnde({ evento }: { evento: EventoPublico }) {
  const faltando: string[] = [];
  if (!evento.localNome) faltando.push("o local");
  if (!evento.horaEvento) faltando.push("o horário");

  return (
    <Stack component="section" sx={{ gap: 2 }}>
      <Typography variant="overline" component="p" sx={{ color: "primary.dark" }}>
        Onde
      </Typography>

      <Typography variant="h3" component="h2" sx={{ color: "text.primary" }}>
        {evento.localNome ?? `${evento.cidade}, ${evento.uf}`}
      </Typography>

      {evento.localNome && (
        <Typography variant="subtitle1" component="p" sx={{ color: "text.secondary" }}>
          {evento.cidade}, {evento.uf}
        </Typography>
      )}

      <Card>
        <CardContent>
          <Stack sx={{ gap: 2 }}>
            {evento.mapa ? (
              <>
                {evento.mapa.precisao === "regiao" && (
                  // Texto explicando o círculo. Sem esta frase, o convidado
                  // interpreta a área destacada como imprecisão do mapa e tenta
                  // ampliar — e o mapa não amplia.
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    A região do casamento, por enquanto. O endereço exato entra
                    aqui assim que for divulgado.
                  </Typography>
                )}
                <MapaDoLocal
                  mapa={evento.mapa}
                  eventoId={evento.id}
                  endereco={evento.localEndereco}
                />
              </>
            ) : (
              <Typography variant="body1" sx={{ color: "text.primary" }}>
                Vai ser em {evento.cidade}. O local entra aqui assim que for
                definido.
              </Typography>
            )}

            {faltando.length > 0 && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Ainda falta confirmar {faltando.join(" e ")} — a gente atualiza
                esta página assim que fechar.
              </Typography>
            )}

            {evento.horaEvento && (
              <Typography variant="body1" sx={{ color: "text.primary" }}>
                A cerimônia começa às {horaParaExibir(evento.horaEvento)}.
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default SecaoOnde;
