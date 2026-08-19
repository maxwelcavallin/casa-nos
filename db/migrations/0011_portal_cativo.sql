-- 0011 — o quarto valor de `tipo_erro`: `portal` (metricas.md §6.2, corrigida).
--
-- POR QUE UMA MIGRATION SÓ PARA ISSO, e por que ela não é cosmética:
--
-- O portal cativo é o wifi de salão que responde HTML com status 200 a qualquer
-- requisição. Ele estava viajando como `rede` desde a F1.2, e a §6.2 do
-- `metricas.md` fechou a divergência: ele é valor próprio, com a MESMA palavra
-- no banco e no GA4.
--
-- O MOTIVO É OPERACIONAL, e é o único que importa às 23h:
--   `rede`   é a internet que CAIU     → a resposta certa é NÃO fazer nada, a
--                                        fila existe exatamente para isso.
--   `portal` é a internet que MENTIU   → o envio parece ter completado e a foto
--                                        não existe. É o único erro desta lista
--                                        que produz PERDA SILENCIOSA, e o único
--                                        em que agir é obrigatório: trocar de
--                                        rede, ou passar para o QR do plano B.
--
-- Colapsados num valor só, o painel do dia recomendaria "não faça nada" no
-- único caso em que agir é obrigatório. É por isso que isto vale uma migration.
--
-- A RESSALVA, que o GA4 sozinho não resolve, e que está escrita aqui porque é
-- aqui que ela deixa de importar: num portal cativo a requisição para o
-- `/g/collect` também é interceptada. **O evento que descreve o portal é
-- justamente o que o portal engole** — o GA4 vai subnotificar esse valor por
-- construção. Quando ele aparecer lá, já é diagnóstico; quando não aparecer, não
-- prova nada. A contagem que vale é esta tabela, e é dela que o painel do dia
-- ao vivo (H-19) lê a linha 4.

alter table eventos_de_erro drop constraint if exists eventos_de_erro_tipo_erro_check;

alter table eventos_de_erro
  add constraint eventos_de_erro_tipo_erro_check
  check (tipo_erro in ('rede', 'portal', 'servidor', 'arquivo'));

-- A linha 4 do painel do dia ao vivo: erros por tipo, na janela da festa, deste
-- evento. Sem este índice ela varre a tabela inteira a cada 60 s durante a
-- noite — que é justamente a noite em que a tabela está crescendo mais rápido.
create index if not exists eventos_de_erro_tipo_idx
  on eventos_de_erro (evento_id, tipo_erro, criado_em desc)
  where tipo_erro is not null;
