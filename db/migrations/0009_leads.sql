-- 0009 — o loop que não fecha por cookie (PRD §5.8, H-16).
--
-- POR QUE ESTA TABELA É REQUISITO DA FATIA 1, e não da 2: o clique acontece no
-- celular, na festa; o cadastro acontece meses depois, provavelmente noutro
-- aparelho, e com `analytics_storage: denied` não existe cookie segurando a
-- ponta. Sem `evento_id_origem` PERSISTIDO NO SERVIDOR, o número que decide se
-- este negócio tem canal de aquisição sai ZERO POR CONSTRUÇÃO (`metricas.md`
-- §14.6). O loop não tem segunda festa.

create table if not exists leads (
  id               uuid        primary key default gen_random_uuid(),

  -- É o `referring_wedding_id`. NOT NULL de propósito: um lead sem origem não
  -- serve para a única pergunta que esta tabela existe para responder.
  evento_id_origem uuid        not null references eventos (id),
  participacao_id  uuid        references participacoes (id),

  cta_superficie   text        check (cta_superficie in ('confirmacao_envio', 'album', 'feed', 'telao')),

  -- PII. Fica AQUI, nunca no GA4. Para o GA4 vão só a bandeira e o mês.
  contato          text        not null,
  contato_tipo     text        not null default 'whatsapp'
                    check (contato_tipo in ('whatsapp')),
  nome             text,

  tem_data         boolean     not null default false,
  mes_previsto     text        check (mes_previsto ~ '^\d{4}-(0[1-9]|1[0-2])$'),

  -- Consentimento com o TEXTO que a pessoa leu, e a data. Sem o texto, daqui a
  -- um ano ninguém sabe ao que ela consentiu — e "ela aceitou" deixa de ser
  -- verificável no único momento em que alguém pergunta.
  permissao_em     timestamptz not null,
  permissao_texto  text        not null,

  -- A coorte ABERTA: quantos leads, quantos ainda dentro da janela de 18 meses,
  -- quantos convertidos. Sem `convertido_em`, o loop volta a ser um zero sem
  -- contexto (`metricas.md` §4.1).
  convertido_em    timestamptz,
  usuario_id       uuid,

  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz,
  excluido_em      timestamptz
);

create index if not exists leads_origem_idx on leads (evento_id_origem);
create index if not exists leads_coorte_idx
  on leads (evento_id_origem, tem_data, criado_em) where excluido_em is null;
create index if not exists leads_mes_idx on leads (mes_previsto) where excluido_em is null;

-- O MESMO CONTATO, NA MESMA FESTA, NÃO VIRA DOIS LEADS.
--
-- Não é higiene de dado: a folha do CTA reenvia sozinha quando a rede volta
-- (H-16, estado de erro), e a fila local pode acordar no dia seguinte com o
-- mesmo lead guardado. Sem esta chave, "9 pessoas deixaram contato" viraria 14
-- por retentativa — e o número que mede o loop passaria a medir a rede do
-- salão.
create unique index if not exists leads_contato_unico
  on leads (evento_id_origem, contato) where excluido_em is null;
