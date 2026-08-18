-- 0001 — o evento como inquilino.
--
-- Esta é a primeira migration do produto e ela decide o formato do resto. O
-- produto NÃO é "o site do casamento da Ana e do Maxwel": é um produto de
-- casamentos cujo primeiro inquilino é o casamento deles. `eventos` é a raiz;
-- tudo pendura nela por `evento_id`; o segundo casal entra com INSERT, sem
-- migration e sem deploy.
--
-- Migration aplicada é IMUTÁVEL. Corrigir é escrever a 0002.
--
-- Por que cada comando é idempotente (`if not exists`): o driver HTTP do Neon
-- executa uma instrução por requisição, sem transação que abrace o arquivo
-- inteiro. Se a quinta falhar, as quatro primeiras ficaram. Idempotente, rodar
-- de novo depois de consertar é seguro — que é o comportamento que o runner
-- (`scripts/migrar.mjs`) precisa ter para não deixar o banco num meio-termo que
-- só o banco conhece.

-- NÃO existe `create extension pgcrypto` aqui, de propósito: `gen_random_uuid()`
-- é função de núcleo desde o Postgres 13, e o Neon roda muito acima disso.
-- Pedir a extensão não acrescentaria nada e acrescentaria uma forma de falhar —
-- num banco cujo papel não tem permissão de criar extensão, a migration inteira
-- pararia na primeira linha, e a mensagem ("extension is not available") não
-- diria a ninguém que a culpa era de uma linha desnecessária.

-- ─────────────────────────────────────────────────────────────────────────────
-- eventos — a raiz do inquilino
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists eventos (
  id                   uuid primary key default gen_random_uuid(),

  -- Chave humana do inquilino. Serve a /e/<slug> e é o que o seed usa para ser
  -- idempotente.
  slug                 text        not null,

  -- Como o casal quer ser lido no título da página. Um campo, e não
  -- nome_noivo/nome_noiva: o produto não tem opinião sobre a composição do
  -- casal, e "Ana Flávia e Maxwel" é uma decisão de quem casa, não de quem
  -- programa.
  nome_casal           text        not null,

  -- `date`, não `timestamptz`: o dia do casamento não é um instante, é uma data
  -- de calendário. Guardá-lo como instante é como se perde um dia na virada de
  -- fuso (ver lib/db-tipos.ts).
  data_evento          date        not null,

  -- `time` separado, e nulo enquanto não houver horário divulgado. Nulo aqui
  -- SIGNIFICA "ainda não definido" — não é "esqueci de preencher".
  hora_evento          time,
  hora_publicada       boolean     not null default false,

  fuso                 text        not null default 'America/Sao_Paulo',

  cidade               text        not null,
  uf                   text        not null,

  -- O NOME do local e o LUGAR do local são publicados separadamente.
  -- O casal pode querer o mapa visível e o nome escondido — que é exatamente o
  -- caso deste primeiro evento. Duas colunas, duas flags, e revelar depois é
  -- UPDATE, não deploy.
  local_nome           text,
  local_nome_publicado boolean     not null default false,

  local_endereco       text,
  local_latitude       numeric(9,6),
  local_longitude      numeric(9,6),

  -- Raio de imprecisão, em metros: o quanto o ponto acima está deliberadamente
  -- vago. Com `local_revelacao = 'regiao'` o mapa mostra esta ÁREA e nenhum
  -- marcador, então o ponto guardado não precisa ser (e não deve ser) o
  -- endereço real.
  local_raio_metros    integer,

  -- text + CHECK, não o tipo `enum` do Postgres: acrescentar um valor a um enum
  -- de Postgres é uma migration desagradável, e este campo vai ganhar valores.
  local_revelacao      text        not null default 'oculto'
                        check (local_revelacao in ('oculto', 'regiao', 'exato')),

  -- Rascunho não aparece só porque alguém acertou o slug. O casal cadastra
  -- semanas antes de divulgar.
  publicado            boolean     not null default false,

  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz,
  excluido_em          timestamptz
);

-- Único entre os vivos: o slug de um evento excluído pode ser reaproveitado.
create unique index if not exists eventos_slug_unico
  on eventos (slug) where excluido_em is null;

create index if not exists eventos_publicado_idx
  on eventos (publicado) where excluido_em is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- evento_dominios — como a requisição vira inquilino
-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela separada, e não uma coluna `dominio` em `eventos`, porque um casamento
-- tem mais de um endereço desde o primeiro dia: o domínio do casal
-- (anaemax.com.br), o mesmo com www e o domínio de pré-visualização. Como
-- coluna, o segundo endereço viraria uma segunda linha de evento — dois
-- inquilinos para um casamento só.
create table if not exists evento_dominios (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid        not null references eventos (id) on delete cascade,

  -- Sempre em minúsculas e sem `www.` — a normalização é feita antes da
  -- consulta em lib/ids.ts. Guardar com caixa mista faria `AnaEMax.com.br`
  -- responder 404.
  dominio       text        not null,
  principal     boolean     not null default false,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  excluido_em   timestamptz
);

create unique index if not exists evento_dominios_unico
  on evento_dominios (dominio) where excluido_em is null;

-- Toda FK tem índice.
create index if not exists evento_dominios_evento_idx
  on evento_dominios (evento_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- evento_indicacoes — hospedagem e dicas
-- ─────────────────────────────────────────────────────────────────────────────
-- Modelada pensando no dia em que virar conteúdo editável por painel: `ordem`
-- existe para o casal arrastar, `publicado` para esconder sem apagar, e
-- `excluido_em` para desfazer. Nada disso é usado hoje pelo site — hoje quem
-- escreve é o seed —, e é justamente por isso que precisa estar aqui: colocar
-- depois obriga a migrar dado que já existe.
create table if not exists evento_indicacoes (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid        not null references eventos (id) on delete cascade,

  tipo          text        not null
                 check (tipo in ('hospedagem', 'dica')),

  titulo        text        not null,
  descricao     text,

  -- Distância ou região, em texto livre: "8 min do local", "Barra da Tijuca".
  -- Texto e não número porque o casal escreve o que faz sentido para o
  -- convidado, e porque hoje não existe endereço para calcular distância.
  referencia    text,

  url           text,

  ordem         integer     not null default 0,
  publicado     boolean     not null default true,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  excluido_em   timestamptz
);

create index if not exists evento_indicacoes_evento_idx
  on evento_indicacoes (evento_id);

-- A consulta pública ordena por (ordem, titulo) dentro de um evento. Sem este
-- índice a ordenação vira varredura — invisível com 6 itens, incidente com 60
-- eventos no ar.
create index if not exists evento_indicacoes_ordem_idx
  on evento_indicacoes (evento_id, ordem, titulo)
  where excluido_em is null;
