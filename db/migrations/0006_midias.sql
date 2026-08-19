-- 0006 — a tabela que decide o projeto.
--
-- Esta tabela carrega, sozinha, as três coisas que o product-analytics provou
-- que exigem schema:
--   1. A INTENÇÃO gravada antes dos bytes  → estado 'intencao'
--   2. As DUAS FAIXAS separadas            → previa_armazenada_em / original_armazenada_em
--   3. A IDEMPOTÊNCIA da fila              → índice único (evento_id, client_media_id)
-- Tirar qualquer uma delas não quebra nada visivelmente: só faz o critério de
-- término da fatia medir zero e parecer aprovado justamente quando falhou.

create table if not exists midias (
  id                       uuid        primary key default gen_random_uuid(),
  evento_id                uuid        not null references eventos (id) on delete cascade,
  participacao_id          uuid        not null references participacoes (id),

  -- Agrupamento de rajada (B11): gerado no aparelho, um por seleção. O feed
  -- mostra o lote como um cartão com contagem.
  lote_id                  uuid        not null,

  -- O id do item na fila LOCAL. É o que impede que um envio que falhou e depois
  -- completou conte duas vezes (metricas.md §9).
  client_media_id          uuid        not null,

  -- sha-256 do conteúdo, calculado no aparelho. Serve para de-duplicar reenvio
  -- por precaução — que é a atitude certa quando a alternativa é perder.
  hash_conteudo            text,

  estado                   text        not null default 'intencao'
                            check (estado in ('intencao', 'armazenada', 'falhou', 'removida')),

  -- DOIS valores, não três. "Ambos" não é estado: o feed já inclui o casal
  -- (PRD §3.1, V1). Escrita EXCLUSIVA de quem enviou (PRD §3.2, P2).
  visibilidade             text        not null default 'feed'
                            check (visibilidade in ('feed', 'noivos')),
  visibilidade_alterada    boolean     not null default false,

  -- A coluna do CASAL. Ele nunca escreve `visibilidade`; quando tira algo do
  -- feed, escreve aqui. É o que torna "o casal nunca promove noivos para o feed"
  -- uma impossibilidade estrutural em vez de um `if`.
  aprovacao                text        not null default 'nao_requer'
                            check (aprovacao in ('nao_requer', 'pendente', 'aprovada', 'recusada')),
  moderada_em              timestamptz,
  moderada_por             uuid        references evento_acessos (id),

  origem                   text        check (origem in ('camera', 'galeria')),
  tipo_arquivo             text,
  bytes                    bigint,          -- do original, declarado na intenção
  bytes_previa             integer,
  largura                  integer,
  altura                   integer,

  -- Hora do EXIF, opcional. A ORDEM DO FEED É SEMPRE `armazenada_em` (hora do
  -- servidor): relógio de aparelho erra, e um feed fora de ordem no telão é
  -- visível para 200 pessoas (B12, dados.md §4).
  capturada_em             timestamptz,

  criada_em                timestamptz not null default now(),  -- a INTENÇÃO
  previa_armazenada_em     timestamptz,                          -- a faixa que CONTA
  original_armazenada_em   timestamptz,                          -- qualidade, não perda
  armazenada_em            timestamptz,                          -- = previa_armazenada_em

  enfileirada_offline      boolean     not null default false,
  tentativas               integer     not null default 0,
  adotada_por_reconciliacao boolean    not null default false,
  reconciliada_em          timestamptz,

  -- Prévia que o navegador não conseguiu gerar (HEIC exótico, B8). O cron gera.
  previa_pendente_servidor boolean     not null default false,

  excluida_em              timestamptz,
  excluida_por             text        check (excluida_por in ('convidado', 'casal')),
  objeto_expurgado_em      timestamptz  -- 30 dias de carência depois da exclusão
);

-- A IDEMPOTÊNCIA DE VERDADE É DO SERVIDOR. O cliente ajuda; o banco decide.
create unique index if not exists midias_client_unico
  on midias (evento_id, client_media_id);

-- Reenvio do mesmo arquivo pela mesma pessoa devolve a mídia existente.
create unique index if not exists midias_hash_unico
  on midias (participacao_id, hash_conteudo)
  where hash_conteudo is not null and excluida_em is null;

-- O feed. Sem este índice parcial, a consulta mais quente do produto vira
-- varredura — invisível com 40 fotos, incidente com 4.000.
create index if not exists midias_feed_idx
  on midias (evento_id, armazenada_em desc, id desc)
  where estado = 'armazenada' and visibilidade = 'feed'
    and aprovacao in ('nao_requer', 'aprovada') and excluida_em is null;

create index if not exists midias_participacao_idx
  on midias (participacao_id, criada_em desc) where excluida_em is null;

-- A consulta de PERDA (bloqueio 1). Ela roda uma vez por dia sobre a tabela
-- inteira; sem índice, ela cresce junto com o produto.
create index if not exists midias_intencao_idx
  on midias (evento_id, criada_em) where estado = 'intencao';

create index if not exists midias_fila_idx
  on midias (evento_id, criada_em) where aprovacao = 'pendente' and excluida_em is null;

create index if not exists midias_original_pendente_idx
  on midias (evento_id)
  where previa_armazenada_em is not null and original_armazenada_em is null;

create index if not exists midias_evento_idx on midias (evento_id);

-- LAYOUT DAS CHAVES NO R2 — fixado aqui, e mudar depois é migração de blob
-- (escopo-core.md §9, PRD §5.5). Ele vive em código em lib/r2.ts e é o mesmo:
--
--   e/<evento_id>/m/<midia_id>/t.jpg    miniatura, 400 px, sem EXIF
--   e/<evento_id>/m/<midia_id>/p.jpg    prévia,  1600 px, sem EXIF   ← a que conta
--   e/<evento_id>/m/<midia_id>/o.<ext>  original, como veio          ← o que o casal exporta
--
-- O `midia_id` só existe DEPOIS da linha de intenção. É por isso que não pode
-- haver objeto no R2 sem linha no banco, e é por isso que a reconciliação é um
-- HEAD nas chaves esperadas em vez de uma varredura do balde (V3).
