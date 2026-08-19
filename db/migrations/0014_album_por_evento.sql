-- 0014 — o álbum passa a ser uma capacidade do evento.
--
-- ESTA MIGRATION É O QUE TIRA O ÁLBUM DO AR. O default é `false`, e por isso
-- aplicá-la desliga o álbum do casamento cobaia, que é exatamente o que a v1.0
-- pede. Religar é `UPDATE eventos SET album_ativo = true WHERE id = ...` — sem
-- deploy, sem migration, um evento de cada vez.
--
-- QUEM APLICAR ISTO ACHANDO QUE É ADITIVA INOFENSIVA VAI DERRUBAR O ÁLBUM.
-- Está escrito aqui porque é o risco de verdade da v1.0 (prd-v1 §12.1): a forma
-- do banco não muda, nenhuma linha é apagada, e mesmo assim seis telas param de
-- responder no instante em que a coluna nasce.
--
-- POR QUE COLUNA E NÃO VARIÁVEL DE AMBIENTE: variável de ambiente é global e
-- invisível. Num produto multi-inquilino, "o álbum está ligado?" é pergunta POR
-- CASAMENTO — o cobaia liga no dia do ensaio, o segundo casal não liga nunca. E
-- variável de ambiente não aparece em consulta, não aparece em teste com dois
-- inquilinos e não deixa rastro de quando mudou.
--
-- É O MESMO PADRÃO QUE O PRODUTO JÁ USA: `local_revelacao` decide quanto do
-- lugar o site conta, e revelar é mudança de dado, não de código.

alter table eventos add column if not exists album_ativo boolean not null default false;

-- Índice parcial: as consultas que varrem eventos com álbum (a reconciliação
-- diária, H-15) passam a filtrar por aqui, e com quase todos os eventos em
-- `false` o índice parcial é pequeno e a varredura some.
create index if not exists eventos_album_ativo_idx
  on eventos (album_ativo) where album_ativo = true and excluido_em is null;
