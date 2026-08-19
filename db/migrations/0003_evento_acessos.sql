-- 0003 — casal, moderador e telão em UMA tabela.
--
-- POR QUE UMA TABELA E NÃO TRÊS: a Fatia 1 introduz quatro portadores de uma vez
-- (participação, casal, moderador, telão). Nascendo em quatro lugares, viram o
-- `if` espalhado que stack.md §3 proíbe (escopo-core.md §9). Aqui são três tipos
-- de uma coisa só, e lib/sessao.ts resolve os quatro num arquivo.

create table if not exists evento_acessos (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid        not null references eventos (id) on delete cascade,

  tipo          text        not null
                 check (tipo in ('casal', 'moderador', 'telao')),

  -- sha-256 do token, NUNCA o token. Quem lê o banco não ganha acesso a nada.
  token_hash    text        not null,

  -- "Padrinho João", "Telão do salão". Serve à tela de revogação: revogar um
  -- token sem saber de quem ele é não é uma ação que alguém toma.
  rotulo        text,

  -- Marca o acesso do DONO do produto, que enxerga a medição (§7). É um booleano
  -- e não um quarto tipo: o dono também é o casal no casamento cobaia.
  dono          boolean     not null default false,

  expira_em     timestamptz,
  ultimo_uso_em timestamptz,
  revogado_em   timestamptz,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);

create unique index if not exists evento_acessos_token_unico
  on evento_acessos (token_hash) where revogado_em is null;
create index if not exists evento_acessos_evento_idx
  on evento_acessos (evento_id, tipo) where revogado_em is null;

-- Link de entrada do casal: vale 30 minutos e uma vez só. Tabela separada porque
-- o ciclo de vida é outro — este morre no primeiro uso, aquele dura 30 dias.
create table if not exists evento_acessos_convites (
  id          uuid primary key default gen_random_uuid(),
  evento_id   uuid        not null references eventos (id) on delete cascade,
  token_hash  text        not null,
  expira_em   timestamptz not null,
  usado_em    timestamptz,
  criado_em   timestamptz not null default now()
);

create unique index if not exists evento_acessos_convites_token
  on evento_acessos_convites (token_hash);
create index if not exists evento_acessos_convites_evento_idx
  on evento_acessos_convites (evento_id);
