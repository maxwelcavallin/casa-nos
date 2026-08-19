-- 0004 — o denominador da North Star.
--
-- POR QUE ELA ENTRA NA F1.1 E A TELA DELA NÃO (H-03 é da F1.3): `participacoes`
-- (0005) tem chave estrangeira para cá. Criar a tabela depois obrigaria a 0005 a
-- nascer sem a FK e a ganhar a FK numa migration posterior — que é mudança de
-- forma numa tabela já povoada, o tipo de coisa que este projeto evita de
-- propósito. A tabela nasce agora; a tela de colar nomes nasce na F1.3.
--
-- Um SLOT, não uma pessoa: "Família Silva" é UM slot com pessoas_no_slot = 4
-- (metricas.md §1.1). A North Star conta slots; a banda por pessoa sai daqui.
-- Esta é a lista MÍNIMA da Fatia 1: nome e tamanho. RSVP, telefone, mesa e grupo
-- são Fatia 2, e nenhum deles é acrescentado aqui por antecipação.

create table if not exists convidados (
  id              uuid        primary key default gen_random_uuid(),
  evento_id       uuid        not null references eventos (id) on delete cascade,

  nome            text        not null,

  -- O tamanho do erro E1 de metricas.md §1.2 depende deste número existir.
  pessoas_no_slot integer     not null default 1 check (pessoas_no_slot >= 1),

  -- NULO significa "não informado", e é diferente de false. O denominador de P
  -- exclui só quem foi marcado ausente de verdade.
  ausente         boolean,

  ordem           integer     not null default 0,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz,
  excluido_em     timestamptz
);

create index if not exists convidados_evento_idx on convidados (evento_id);
create index if not exists convidados_ordem_idx
  on convidados (evento_id, ordem, nome) where excluido_em is null;

-- NÃO existe índice único por nome, de propósito: dois "Tio Carlos" acontecem em
-- toda festa, e bloquear cria um beco sem saída no meio do casamento
-- (escopo-core.md §3.1). A tela avisa; o banco não impede.
