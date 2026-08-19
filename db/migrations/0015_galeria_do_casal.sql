-- 0015 — a galeria de fotos do casal (decisão do dono, Q-V2, 19/08/2026).
--
-- DUAS COISAS NUM ARQUIVO SÓ, e elas são a mesma mudança: a tabela do conteúdo,
-- e a oitava chave no CHECK de `evento_secoes`. Separar em dois arquivos daria
-- um estado intermediário em que a tabela existe e a seção não pode ser ligada.
--
-- O QUE ESTA MIGRATION NÃO TEM, E É A DECISÃO MAIS IMPORTANTE DELA:
-- não há coluna de chave do R2, e não há coluna de original.
--
--   * A CHAVE É DERIVADA, não guardada: `pub/e/<evento_id>/g/<id>/{t,p}.jpg`,
--     montada por `chavesDaFoto()` em lib/r2.ts. Guardar a chave numa coluna
--     criaria uma SEGUNDA fonte de verdade sobre o layout do balde, e o layout
--     tem exatamente um dono (RN-33). Coluna de chave é como um layout de balde
--     passa a divergir do código que o monta.
--   * NÃO HÁ ORIGINAL (§4.8.2). Sem ele não há `prv/`, não há assinatura no
--     caminho quente, não há download, não há expurgo e — o que mais importa —
--     nenhum EXIF, inclusive GPS, chega ao balde: o canvas re-codifica a partir
--     dos pixels, e pixels não têm EXIF.

-- ─────────────────────────────────────────────────────────────────────────────
-- evento_fotos — no máximo 12 por evento (§4.8.1), tratadas no servidor
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists evento_fotos (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid        not null references eventos (id) on delete cascade,

  -- Texto puro, como todo texto do casal (RV-07). Nulo = sem legenda, e nesse
  -- estado a página NÃO desenha elemento de legenda.
  legenda       text        check (legenda is null or length(legenda) <= 80),

  -- NOT NULL de propósito: vêm do navegador que gerou a derivada e existem para
  -- a página reservar a proporção ANTES de a imagem carregar. Sem elas a galeria
  -- reflui ao carregar, e refluxo é reprovação de design (§4.8.1).
  --
  -- E `not null` NÃO É VALIDAÇÃO (RV-26): ele não impede `0`, não impede um par
  -- trocado e não impede um par que não bate com o arquivo. As cinco recusas
  -- nomeadas moram em `conferirMedidas()`, em lib/galeria.ts, e a outra metade
  -- da regra é do site: foto sem medidas coerentes NÃO RENDERIZA.
  largura       integer     not null check (largura > 0),
  altura        integer     not null check (altura  > 0),
  bytes_previa  integer,

  ordem         integer     not null default 0,

  -- A MESMA DISCIPLINA DA TABELA `midias`: A LINHA NASCE ANTES DO OBJETO.
  -- `armazenada_em` nulo = intenção criada, bytes ainda não confirmados. Uma
  -- linha nesse estado NÃO renderiza no site e NÃO conta contra o teto de 12.
  -- É o que torna impossível existir objeto no balde sem linha no banco.
  --
  -- E NÃO HÁ CRON DE LIMPEZA, de propósito: uma intenção que nunca confirma é
  -- lixo NA TABELA, não no balde, e com teto de 12 por evento isso não é
  -- problema. Escrever a ausência é mais barato que construir o faxineiro.
  armazenada_em timestamptz,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  excluido_em   timestamptz
);

create index if not exists evento_fotos_evento_idx
  on evento_fotos (evento_id);

-- A consulta da página pública: as fotos armazenadas, na ordem do casal.
create index if not exists evento_fotos_ordem_idx
  on evento_fotos (evento_id, ordem, criado_em)
  where excluido_em is null and armazenada_em is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- A OITAVA CHAVE DE SEÇÃO
--
-- A 0012 está aplicada e é IMUTÁVEL (dados.md §1). Corrigir é migration nova, e
-- é isto aqui. A ARMADILHA: o nome da constraint foi gerado pelo Postgres, e é
-- `evento_secoes_chave_check`. Um `drop constraint` com nome errado passa
-- silenciosamente por causa do `if exists` e deixa o CHECK antigo de pé — a
-- seção `galeria` então falha ao ser ligada, em produção, com erro de
-- constraint que não diz nada a quem lê. Confira o nome com \d evento_secoes
-- antes de aplicar.
-- ─────────────────────────────────────────────────────────────────────────────
alter table evento_secoes drop constraint if exists evento_secoes_chave_check;

alter table evento_secoes add constraint evento_secoes_chave_check
  check (chave in ('capa','onde','programacao','historia','galeria',
                   'perguntas','indicacoes','rodape'));
