import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { sql } from "@/lib/db";
import { ehUuid } from "@/lib/ids";
import { conferirEvento } from "@/lib/site-evento";

/**
 * A CAPA E O "ONDE E QUANDO" (v1.0, V-04 e V-05).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UMA ROTA PARA DUAS SEÇÕES porque as duas escrevem colunas de `eventos`. Duas
 * rotas gravando na mesma linha se atropelariam no `atualizado_em` e obrigariam
 * a repetir aqui as três regras cruzadas (horário publicado sem horário, nome
 * publicado sem nome, `exato` sem endereço) — que é justamente onde o erro
 * moraria.
 *
 * **É AQUI QUE O `db/seed/*.json` DEIXA DE SER NECESSÁRIO.** Até esta rota, mudar
 * o horário do casamento significava editar um JSON no repositório e rodar
 * `pnpm db:seed` num terminal. Para o casal cobaia, isso equivalia a não ter
 * produto.
 *
 * **`coalesce(${valor}, coluna)` no que não aceita nulo, `case when` no que
 * aceita.** O que não foi mandado fica como está — salvar só a cidade não pode
 * apagar o horário. E onde o nulo É um valor (horário ainda não definido, local
 * ainda sem nome, ponto ainda sem coordenada), o `coalesce` tornaria impossível
 * voltar ao estado "ainda não definido", e um dado errado ficaria para sempre.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/eventos/[id]/site/evento";

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  // Antes de qualquer consulta (`dados.md` §3).
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  const { mudanca, erros } = conferirEvento(corpo, acesso.evento);

  // O erro vai identificado por campo: ele aparece NO campo, não num alerta no
  // topo que o celular deixa fora da tela.
  if (Object.keys(erros).length > 0) return pedidoInvalido(erros);

  const linhas = await sql`
    update eventos set
      nome_casal           = coalesce(${mudanca.nomeCasal ?? null}, nome_casal),
      data_evento          = coalesce(${mudanca.dataEvento ?? null}::date, data_evento),
      hora_evento          = case when ${mudanca.horaEvento !== undefined}
                                  then ${mudanca.horaEvento ?? null}::time
                                  else hora_evento end,
      hora_publicada       = coalesce(${mudanca.horaPublicada ?? null}::boolean, hora_publicada),
      cidade               = coalesce(${mudanca.cidade ?? null}, cidade),
      uf                   = coalesce(${mudanca.uf ?? null}, uf),

      local_nome           = case when ${mudanca.localNome !== undefined}
                                  then ${mudanca.localNome ?? null}::text
                                  else local_nome end,
      local_nome_publicado = coalesce(${mudanca.localNomePublicado ?? null}::boolean, local_nome_publicado),
      local_endereco       = case when ${mudanca.localEndereco !== undefined}
                                  then ${mudanca.localEndereco ?? null}::text
                                  else local_endereco end,
      local_revelacao      = coalesce(${mudanca.localRevelacao ?? null}, local_revelacao),
      local_latitude       = case when ${mudanca.localLatitude !== undefined}
                                  then ${mudanca.localLatitude ?? null}::numeric
                                  else local_latitude end,
      local_longitude      = case when ${mudanca.localLongitude !== undefined}
                                  then ${mudanca.localLongitude ?? null}::numeric
                                  else local_longitude end,
      local_raio_metros    = case when ${mudanca.localRaioMetros !== undefined}
                                  then ${mudanca.localRaioMetros ?? null}::integer
                                  else local_raio_metros end,

      atualizado_em        = now()
     where id = ${acesso.evento.id}
       and excluido_em is null
    returning id
  `;

  if (!linhas.length) return naoEncontrado();
  return NextResponse.json({ salvo: true });
});
