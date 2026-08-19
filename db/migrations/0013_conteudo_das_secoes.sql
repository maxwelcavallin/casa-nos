-- 0013 — o conteúdo das três seções novas: história, programação e perguntas.
--
-- TRÊS TABELAS TIPADAS, e não um blob JSON de blocos. É a consequência que a
-- decisão do dono de 18/08/2026 já tinha escrito: com seções fixas, o conteúdo
-- tem forma conhecida, e forma conhecida no Postgres se consulta, se indexa, se
-- valida com CHECK e aparece no `tsc`. Um `jsonb` daria o editor de blocos que a
-- decisão recusou, pela porta dos fundos.

-- ─────────────────────────────────────────────────────────────────────────────
-- evento_historia — uma linha por evento
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists evento_historia (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid        not null references eventos (id) on delete cascade,

  titulo        text,
  -- TEXTO PURO. A renderização escapa; parágrafo é linha em branco. Não existe
  -- HTML do casal em nenhum ponto deste produto.
  texto         text        not null check (length(texto) <= 1200),

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  excluido_em   timestamptz
);

create unique index if not exists evento_historia_unica
  on evento_historia (evento_id) where excluido_em is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- evento_programacao — os momentos do dia
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists evento_programacao (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid        not null references eventos (id) on delete cascade,

  -- `time` e não `timestamptz`, pela mesma razão de `eventos.hora_evento`: é
  -- hora de relógio de parede no dia do evento, no fuso do evento. Guardar como
  -- instante obrigaria a inventar uma data para um horário que ainda não tem
  -- data confirmada, e traria de volta o bug de três horas.
  --
  -- NULO SIGNIFICA "momento sem horário anunciado", e a interface mostra isso.
  hora          time,

  titulo        text        not null check (length(titulo) <= 40),
  descricao     text        check (descricao is null or length(descricao) <= 120),
  ordem         integer     not null default 0,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  excluido_em   timestamptz
);

create index if not exists evento_programacao_evento_idx
  on evento_programacao (evento_id);
create index if not exists evento_programacao_ordem_idx
  on evento_programacao (evento_id, ordem, hora, titulo)
  where excluido_em is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- evento_perguntas — as cinco perguntas que a noiva responde trinta vezes
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists evento_perguntas (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid        not null references eventos (id) on delete cascade,

  pergunta      text        not null check (length(pergunta) <= 80),

  -- NULO SIGNIFICA "sugerida e ainda não respondida", e nesse estado a pergunta
  -- NÃO RENDERIZA no site. É o que permite semear as cinco sugestões sem correr
  -- o risco de publicar uma pergunta sem resposta.
  resposta      text        check (resposta is null or length(resposta) <= 300),

  ordem         integer     not null default 0,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  excluido_em   timestamptz
);

create index if not exists evento_perguntas_evento_idx
  on evento_perguntas (evento_id);
create index if not exists evento_perguntas_ordem_idx
  on evento_perguntas (evento_id, ordem, pergunta)
  where excluido_em is null;
