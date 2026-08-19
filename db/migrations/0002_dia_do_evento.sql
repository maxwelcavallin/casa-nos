-- 0002 — o que o evento precisa saber sobre o dia.
--
-- Aditiva: a 0001 está aplicada e é IMUTÁVEL. Nenhuma coluna dela muda de forma.
--
-- TRÊS JANELAS DIFERENTES, e é a distinção que evita um número errado sem erro
-- aparente (PRD §3.1, V9):
--   envio_abre_em / envio_fecha_em  → o que o produto ACEITA
--   inicio_festa_em / fim_festa_em  → o que conta como "durante a festa"
--   janela de medição (48 h)        → derivada, vive na view (0008)
-- Quem confundir as três produz um número errado sem nenhum erro aparecer.
--
-- Idempotente pelo mesmo motivo da 0001: o driver HTTP do Neon executa uma
-- instrução por requisição, sem transação em volta do arquivo. Se a quinta
-- falhar, as quatro primeiras ficaram — e rodar de novo precisa ser seguro.

alter table eventos add column if not exists modo_moderacao text not null
  default 'direto' check (modo_moderacao in ('direto', 'fila'));

-- Ancoradas no EVENTO, não no dia do calendário (escopo-core.md B13). O padrão é
-- D-1 00:00 até D+7 23:59:59 no fuso do evento, calculado em lib/datas.ts e
-- gravado como INSTANTE — para a consulta não depender do fuso do processo.
alter table eventos add column if not exists envio_abre_em     timestamptz;
alter table eventos add column if not exists envio_fecha_em    timestamptz;

-- Interruptor do casal: encerra envios antes do fim da janela (B14).
alter table eventos add column if not exists envios_encerrados_em timestamptz;

-- Fecha o evento a APARELHOS NOVOS sem derrubar quem já está enviando (B14).
alter table eventos add column if not exists novos_aparelhos_bloqueados boolean
  not null default false;

-- "Durante a festa" é indefinível sem estes dois, e dois dos três bloqueios do
-- verde dependem da janela (metricas.md §9).
alter table eventos add column if not exists inicio_festa_em timestamptz;
alter table eventos add column if not exists fim_festa_em    timestamptz;

-- A contagem fechada do buffet. UM campo e UM número digitado uma vez. Sem ele a
-- participação não tem denominador de pessoas (metricas.md §1.3). Nulo SIGNIFICA
-- "ainda não informado" — e a interface mostra isso, nunca calcula sobre zero.
alter table eventos add column if not exists presentes_contagem integer
  check (presentes_contagem is null or presentes_contagem >= 0);

-- Para onde vai o link de acesso do casal (Brevo). Não é login: é destino.
alter table eventos add column if not exists email_casal text;

create index if not exists eventos_janela_envio_idx
  on eventos (envio_abre_em, envio_fecha_em) where excluido_em is null;
