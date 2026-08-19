-- 0008 — o veredito é uma consulta (PRD §5.7, H-15, H-19).
--
-- POR QUE VIEW E NÃO SELECT DIGITADO NA NOITE DA FESTA: `metricas.md` §1.4
-- escreve a consulta canônica de participação e proíbe, com todas as letras,
-- que ela seja digitada à mão às 23h. Uma view é a mesma consulta com nome,
-- versionada junto do schema que ela lê — e quando alguém renomear uma coluna,
-- o erro aparece aqui, no deploy, e não na única noite em que o número importa.
--
-- AS QUATRO SÃO O CRITÉRIO DE TÉRMINO DA FATIA, e não relatório:
--   vw_midias_medicao     a ponte entre `midias` (participacao_id) e a métrica
--                         (convidado_id). Existe para a consulta do
--                         `product-analytics` rodar SEM ser reescrita.
--   vw_participacao_evento  P, o piso e o teto. A North Star.
--   vw_perda_evento       BLOQUEIO 1. O valor esperado é ZERO, sempre.
--   vw_originais_pendentes  qualidade degradada, e NUNCA somada com a de cima.

-- A ponte. `midias` guarda `participacao_id`; a métrica conta por
-- `convidado_id`. E o casal semeando o feed fica FORA do numerador (B6, RN-22):
-- ele publica pelo mesmo fluxo, com `papel = 'casal'`, e contá-lo inflaria
-- justamente o número que decide se o produto continua existindo.
create or replace view vw_midias_medicao as
  select m.*,
         p.convidado_id,
         p.papel,
         p.modo_identificacao
    from midias m
    join participacoes p on p.id = m.participacao_id
   where m.excluida_em is null
     and p.papel = 'convidado';

-- Participação (P), piso e teto por pessoa.
--
-- A JANELA É A DE MEDIÇÃO, e ela NÃO é a janela de envio (PRD §3.1, V9): das
-- 12:00 do dia do evento até 48 h depois, no fuso do evento. `at time zone`
-- resolve o instante real — o mesmo conjunto de mídias sai em `TZ=UTC` e em
-- `TZ=America/Sao_Paulo`, e é isso que `test/medicao.*.test.ts` guarda nos dois
-- fusos. Uma festa que começa às 18h e termina depois da meia-noite fica
-- inteira do lado certo.
create or replace view vw_participacao_evento as
  with janela as (
    select e.id as evento_id,
           e.presentes_contagem,
           (e.data_evento + time '12:00') at time zone e.fuso                       as inicio,
           (e.data_evento + time '12:00') at time zone e.fuso + interval '48 hours' as fim
      from eventos e where e.excluido_em is null
  )
  select j.evento_id,
         (select count(*) from convidados c
           where c.evento_id = j.evento_id and c.excluido_em is null
             and coalesce(c.ausente, false) = false)                as slots_presentes,
         (select count(distinct v.convidado_id) from vw_midias_medicao v
           where v.evento_id = j.evento_id and v.estado = 'armazenada'
             and v.convidado_id is not null
             and v.armazenada_em >= j.inicio and v.armazenada_em < j.fim) as slots_publicaram,
         (select coalesce(sum(c.pessoas_no_slot), 0) from convidados c
           where c.evento_id = j.evento_id and c.id in (
             select distinct v.convidado_id from vw_midias_medicao v
              where v.evento_id = j.evento_id and v.estado = 'armazenada'
                and v.convidado_id is not null
                and v.armazenada_em >= j.inicio and v.armazenada_em < j.fim
           ))                                                       as pessoas_teto,
         j.presentes_contagem
    from janela j;

-- BLOQUEIO 1. Intenção registrada que nunca virou PRÉVIA armazenada, passados
-- 7 dias do evento (RN-14). O valor esperado é ZERO.
--
-- O `estado in ('intencao','falhou')` e o `previa_armazenada_em is null` dizem
-- a mesma coisa por dois caminhos de propósito: se um dia alguém carimbar a
-- data sem mudar o estado, esta view continua contando a verdade.
create or replace view vw_perda_evento as
  select m.evento_id, count(*) as previas_perdidas
    from midias m
    join eventos e on e.id = m.evento_id
   where m.previa_armazenada_em is null
     and m.excluida_em is null
     and m.estado in ('intencao', 'falhou')
     and now() > (e.data_evento + 7) at time zone e.fuso
   group by m.evento_id;

-- QUALIDADE DEGRADADA, e não perda (`escopo-core.md` §2.1). Nunca somar com a
-- de cima; nunca mostrar na mesma linha. A prévia chegou: a foto existe, está
-- no feed, está no telão e está com o casal — o que falta é a versão grande.
create or replace view vw_originais_pendentes as
  select evento_id, count(*) as originais_pendentes
    from midias
   where previa_armazenada_em is not null
     and original_armazenada_em is null
     and excluida_em is null
   group by evento_id;
