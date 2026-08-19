-- 0005 — a identidade é o token.
--
-- A IDENTIDADE É O TOKEN, NUNCA O NOME (escopo-core.md §12.1). Uma linha por
-- aparelho, por evento. O nome é um rótulo pendurado nela: editável, opcional e
-- chave de coisa nenhuma. Nenhuma consulta deste produto agrupa por nome.

create table if not exists participacoes (
  id                    uuid        primary key default gen_random_uuid(),
  evento_id             uuid        not null references eventos (id) on delete cascade,

  -- sha-256 do valor do cookie httpOnly. 12 meses, a mesma retenção da Q9.
  token_hash            text        not null,

  -- 'casal' marca a participação do próprio casal semeando o feed: ela existe,
  -- ela publica, e fica FORA do denominador da North Star (escopo-core.md B6).
  papel                 text        not null default 'convidado'
                         check (papel in ('convidado', 'casal', 'moderador')),

  -- O slot reivindicado. NULO = envio avulso, e a fração de avulsos é o que diz
  -- se P é confiável (metricas.md §1.2, erro E3).
  convidado_id          uuid        references convidados (id),

  -- O que ele digitou, quando não escolheu da lista. Rótulo, nunca chave.
  rotulo                text,

  modo_identificacao    text        check (modo_identificacao in ('lista', 'avulso', 'retomado')),

  -- O "link guardado" (H-22). Credencial ao portador, com os poderes DESTA
  -- participação e de mais nada. Gerar outro invalida este.
  recuperacao_hash      text,
  recuperacao_criada_em timestamptz,

  -- Despriorização, nunca recusa (escopo-core.md §7.6).
  faixa_lenta           boolean     not null default false,

  primeiro_acesso_em    timestamptz not null default now(),
  ultimo_acesso_em      timestamptz,

  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz,
  excluido_em           timestamptz
);

create unique index if not exists participacoes_token_unico
  on participacoes (token_hash) where excluido_em is null;
create unique index if not exists participacoes_recuperacao_unico
  on participacoes (recuperacao_hash)
  where recuperacao_hash is not null and excluido_em is null;
create index if not exists participacoes_evento_idx  on participacoes (evento_id);
create index if not exists participacoes_convidado_idx on participacoes (convidado_id);

-- COOKIE (contrato, e ele vive em lib/participacoes.ts): nome
-- `p_<primeiros 8 caracteres do evento_id>`, httpOnly, Secure, SameSite=Lax,
-- Max-Age de 12 meses, Path=/. UM COOKIE POR EVENTO — sem isso, dois casamentos
-- servidos pelo mesmo host compartilhariam participação, que é a pior falha de
-- privacidade disponível aqui.
