-- 0010 — erro de produção chega a algum lugar que uma pessoa lê (H-18).
--
-- POR QUE 0010 E NÃO 0008: o PRD §5.7 reserva a 0008 às views de medição e a
-- §5.8 reserva a 0009 a `leads`. As duas são da F1.6 e da F1.7. Tomar o número
-- delas obrigaria a renumerar duas migrations escritas por outra pessoa, e
-- migration numerada é combinado entre documentos, não detalhe de arquivo. Os
-- números 0008 e 0009 continuam vagos e reservados; esta entra depois deles.
--
-- POR QUE BANCO E NÃO FERRAMENTA: ADR 0004. Em resumo — o critério de aceite da
-- H-18 pede consulta "por evento e por hora, para a noite da festa", e é uma
-- consulta ao lado das mídias do mesmo evento. Uma ferramenta externa responde
-- "quantos erros"; ela não responde "quais fotos deste casamento estão sem
-- prévia e o que aconteceu com elas", que é a única pergunta da noite.
--
-- NUNCA ENTRA AQUI: nome, telefone, rótulo de convidado, conteúdo de foto, valor
-- de cookie, token. O que entra está no tipo `RegistroDeErro` de
-- lib/observabilidade.ts, e o teste test/observabilidade-sem-pii.test.ts falha
-- se um campo novo abrir essa porta.

create table if not exists eventos_de_erro (
  id              uuid        primary key default gen_random_uuid(),

  -- Nulo quando o erro aconteceu ANTES de o inquilino ser resolvido (host
  -- desconhecido, id malformado). Nulo aqui SIGNIFICA "não deu tempo de saber",
  -- e é diferente de "não pertence a nenhum evento".
  evento_id       uuid        references eventos (id) on delete set null,

  -- 'servidor'  → exceção não tratada numa rota
  -- 'cliente'   → falha relatada pelo aparelho (PUT no R2, sobretudo)
  -- 'alerta'    → o registro de que um alerta SAIU. Mora aqui de propósito: é o
  --               que faz o disparo ser debounçado sem uma segunda tabela.
  origem          text        not null check (origem in ('servidor', 'cliente', 'alerta')),

  -- A rota declarada (lib/rotas.ts), nunca a URL crua: a URL carrega slug e
  -- token, e os dois são identificador legível.
  rota            text        not null,

  -- 'anonimo' | 'convidado' | 'casal' | 'moderador' | 'telao' | 'cron'
  sessao_tipo     text        not null,

  -- Vocabulário fechado, o mesmo de `error_kind` no GA4 (metricas.md §6).
  tipo_erro       text        check (tipo_erro in ('rede', 'servidor', 'arquivo')),

  -- Nome da classe do erro e mensagem. Mensagem de exceção pode conter dado se
  -- alguém interpolar entrada do usuário numa `Error` — por isso ela passa por
  -- `sanearMensagem()` antes de chegar aqui, e o teste guarda isso.
  classe          text,
  mensagem        text,

  http_status     integer,
  midia_id        uuid,

  criado_em       timestamptz not null default now()
);

-- A consulta da noite da festa: por evento e por hora.
create index if not exists eventos_de_erro_evento_hora_idx
  on eventos_de_erro (evento_id, criado_em desc);

-- A janela de 15 minutos do alerta de taxa, e o debounce do próprio alerta.
create index if not exists eventos_de_erro_origem_idx
  on eventos_de_erro (origem, criado_em desc);
