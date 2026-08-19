-- 0012 — o estado de cada seção do site, por evento.
--
-- A decisão do dono em 18/08/2026 é SEÇÕES FIXAS COM CONTEÚDO EDITÁVEL. O
-- catálogo de seções (quais existem, qual a ordem padrão, quais não podem ser
-- desligadas) vive em CÓDIGO, em lib/secoes.ts, porque ele é conhecido em tempo
-- de compilação e porque cada seção tem um componente que a desenha. Esta tabela
-- guarda só o que é DADO: o que este casal ligou, desligou e em que ordem pôs.
--
-- NÃO EXISTE MIGRATION DE DADO AQUI, e a ausência é a decisão mais importante do
-- arquivo: LINHA AUSENTE SIGNIFICA "O PADRÃO DO CATÁLOGO". Um evento recém-criado
-- não tem nenhuma linha e mesmo assim renderiza certo; a linha nasce quando o
-- casal mexe pela primeira vez. Semear sete linhas por evento numa migration
-- seria escrita de dado que precisa ser idempotente, que precisa rodar de novo
-- em cada ambiente, e que ficaria desatualizada no dia em que o catálogo ganhar
-- uma seção.
--
-- NÃO HÁ `excluido_em`: seção não se exclui, se desliga. `ativa = false` é o
-- estado, e ele é reversível sem perder o conteúdo — que é justamente o que a
-- exclusão lógica existe para dar.

create table if not exists evento_secoes (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid        not null references eventos (id) on delete cascade,

  -- Enum de domínio como text + CHECK (dados.md §7): mudar um tipo enum do
  -- Postgres exige migration desagradável, e este conjunto vai crescer.
  chave         text        not null
                 check (chave in ('capa','onde','programacao','historia',
                                  'perguntas','indicacoes','rodape')),

  ativa         boolean     not null default true,
  ordem         integer     not null default 0,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);

-- Uma linha por seção por evento. É o que faz o `on conflict` do painel ser
-- possível: o casal liga a mesma seção duas vezes e continua havendo uma linha.
create unique index if not exists evento_secoes_unica
  on evento_secoes (evento_id, chave);

create index if not exists evento_secoes_ordem_idx
  on evento_secoes (evento_id, ordem, chave);
