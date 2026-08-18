"use client";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { BedDouble, Lightbulb } from "lucide-react";

import { enviarEvento } from "@/lib/analytics";
import type { Indicacao } from "@/lib/eventos";
import { toque } from "@/lib/tokens";

/**
 * Hospedagem e dicas.
 *
 * A SEÇÃO INTEIRA SOME quando não há item cadastrado — nem título, nem card
 * vazio, nem "em breve". Uma seção vazia num convite não informa nada e ainda
 * sugere que alguém esqueceu de preencher.
 *
 * Quem escreve o conteúdo hoje é `pnpm db:seed`. Não existe construtor de
 * seções nesta fatia: é escopo de outra, e está registrado em docs/fatia-0.md.
 * A tabela já nasceu com `ordem`, `publicado` e exclusão lógica justamente para
 * que o dia do editor não exija migrar dado que já está no ar.
 */

const APARENCIA = {
  hospedagem: { Icone: BedDouble, titulo: "Onde ficar" },
  dica: { Icone: Lightbulb, titulo: "Dicas" },
} as const;

export function SecaoIndicacoes({
  indicacoes,
  eventoId,
}: {
  indicacoes: Indicacao[];
  eventoId: string;
}) {
  if (indicacoes.length === 0) return null;

  const grupos = (["hospedagem", "dica"] as const)
    .map(tipo => ({ tipo, itens: indicacoes.filter(i => i.tipo === tipo) }))
    .filter(g => g.itens.length > 0);

  return (
    <Stack component="section" sx={{ gap: 4 }}>
      {grupos.map(grupo => {
        const { Icone, titulo } = APARENCIA[grupo.tipo];
        return (
          <Stack key={grupo.tipo} sx={{ gap: 2 }}>
            <Typography variant="overline" component="p" sx={{ color: "primary.dark" }}>
              {titulo}
            </Typography>

            <Stack sx={{ gap: 2 }}>
              {grupo.itens.map((item, indice) => (
                <Card key={item.id}>
                  <CardContent>
                    <Stack direction="row" sx={{ gap: 2, alignItems: "flex-start" }}>
                      <Icone size={20} aria-hidden />
                      <Stack sx={{ gap: 0.5 }}>
                        <Typography variant="h6" component="h3" sx={{ color: "text.primary" }}>
                          {item.titulo}
                        </Typography>

                        {item.referencia && (
                          <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            {item.referencia}
                          </Typography>
                        )}

                        {item.descricao && (
                          <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            {item.descricao}
                          </Typography>
                        )}

                        {item.url && (
                          <Link
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="body2"
                            // O rótulo diz PARA ONDE o link vai. "Clique aqui"
                            // é inútil para quem navega pela lista de links do
                            // leitor de tela, que ouve só o texto do link.
                            onClick={() =>
                              enviarEvento("recommendation_opened", {
                                wedding_id: eventoId,
                                recommendation_kind: item.tipo,
                                recommendation_position: indice + 1,
                              })
                            }
                            // 44px de alvo de toque (régua §9.4). Com `body2` e
                            // `py: 1` dava 38px: passa despercebido hoje, que a
                            // seção está apagada por não haver indicação
                            // cadastrada, e acende no dia do primeiro hotel —
                            // quando ninguém vai lembrar de conferir.
                            sx={{
                              alignSelf: "flex-start",
                              display: "inline-flex",
                              alignItems: "center",
                              minHeight: toque.minimo,
                            }}
                          >
                            Abrir o site de {item.titulo}
                          </Link>
                        )}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}

export default SecaoIndicacoes;
