-- 0007 — o número que o casal vê.
--
-- `count(*)` ao vivo a cada sondagem, com 200 clientes, é o ponto 5 de quebra da
-- §7 do escopo-core.md. Agregado mantido na MESMA transação da mudança de estado
-- (sql.transaction do driver Neon), e RECOMPUTADO da verdade pelo cron diário —
-- agregado sem recomputação vira número errado permanente, e este produto tem
-- regra explícita de nunca mostrar ao casal número menor que a realidade.
--
-- POR QUE ELE ENTRA NA F1.2 e o painel que o lê só na F1.5: o contador é
-- escrito pela transição de estado da mídia (H-06), não pela tela. Nascendo
-- depois, as mídias da F1.2 ficariam fora da conta até alguém lembrar de
-- recomputar — e "lembrar" é exatamente o que este projeto não usa como
-- mecanismo. O recomputo do cron (H-15) continua sendo a rede de segurança.

create table if not exists evento_contadores (
  evento_id            uuid        primary key references eventos (id) on delete cascade,
  midias_armazenadas   integer     not null default 0,
  midias_intencao      integer     not null default 0,
  originais_pendentes  integer     not null default 0,
  midias_pendentes_fila integer    not null default 0,
  participacoes_ativas integer     not null default 0,
  bytes_total          bigint      not null default 0,
  recomputado_em       timestamptz,
  divergencia_ultima   integer     not null default 0,
  atualizado_em        timestamptz not null default now()
);
