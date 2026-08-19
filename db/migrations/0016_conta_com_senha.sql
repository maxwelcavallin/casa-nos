-- 0016 — a conta com e-mail e senha (decisão do dono, 19/08/2026).
--
-- ELA REVERTE UMA DECISÃO REGISTRADA, e o registro fica: a P4 do `prd.md` dizia
-- que não existe cadastro público e que o casal entra por link mágico de 30
-- minutos. O dono decidiu o contrário — cadastro público que cria o casamento, e
-- senha no lugar do link. A migration anterior que sustentava o link
-- (`evento_acessos_convites`, na 0003) **continua de pé e some do produto**:
-- migration aplicada é imutável, e apagar tabela é migração de dado, não de
-- esquema.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- AS TRÊS COISAS QUE ESTA MIGRATION SEPARA, e por que não são uma só:
--
--   `usuarios`         QUEM entra. Um e-mail, uma senha, e nada de pessoa além
--                      disso — nem nome, nem telefone. O nome do casal mora no
--                      evento, que é o inquilino, e não na conta.
--
--   `usuario_tokens`   os links de uso único que chegam por e-mail: confirmar o
--                      endereço e redefinir a senha. Uma tabela para os dois
--                      porque o ciclo de vida é o mesmo — nasce, expira, morre
--                      no primeiro uso — e porque duas tabelas idênticas viram
--                      duas regras de expiração que divergem no primeiro
--                      conserto.
--
--   `evento_acessos.usuario_id`   O VÍNCULO, e ele é a parte que se erra.
--                      A sessão continua sendo o que sempre foi: uma linha de
--                      `evento_acessos` com o hash de um token ao portador, que
--                      vira cookie. O que muda é que agora ela pode APONTAR para
--                      uma conta. Login não inventa um segundo mecanismo de
--                      sessão: ele cria a mesma linha que o link criava.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- usuarios — quem entra
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists usuarios (
  id                   uuid primary key default gen_random_uuid(),

  -- SEMPRE EM MINÚSCULAS E SEM ESPAÇO NAS PONTAS. A normalização é da aplicação
  -- (`lib/usuarios.ts`), e não do banco, pelo mesmo motivo de `evento_dominios`:
  -- `citext` é extensão, e uma extensão que o papel do banco não pode criar faz
  -- a migration inteira parar na primeira linha, com uma mensagem que não diz a
  -- ninguém que a culpa é de uma linha desnecessária.
  email                text        not null,

  -- **NUNCA A SENHA.** `scrypt$N$r$p$sal$hash`, montado em `lib/senhas.ts`. Os
  -- parâmetros viajam DENTRO do valor de propósito: no dia em que o custo subir,
  -- as senhas antigas continuam conferindo com os parâmetros com que nasceram, e
  -- a troca acontece no login seguinte. Uma coluna com o hash "puro" obriga a
  -- migrar todo mundo de uma vez, o que ninguém faz — e por isso o custo nunca
  -- sobe.
  senha_hash           text        not null,

  -- Nulo = o endereço ainda não foi provado. **Não bloqueia entrar**, e isso é
  -- decisão: o casal que se cadastra na véspera precisa editar o site agora, e
  -- travar a conta atrás de um e-mail que pode cair no lixo eletrônico troca um
  -- risco pequeno por uma parede. O que o endereço não provado NÃO permite é
  -- redefinir a senha — quem recebe o link é quem controla a caixa.
  email_verificado_em  timestamptz,

  ultimo_acesso_em     timestamptz,

  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz,
  excluido_em          timestamptz
);

-- Único entre os vivos, como o slug do evento: o e-mail de uma conta excluída
-- pode voltar a ser usado.
create unique index if not exists usuarios_email_unico
  on usuarios (email) where excluido_em is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- usuario_tokens — confirmar o e-mail, redefinir a senha
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists usuario_tokens (
  id          uuid        primary key default gen_random_uuid(),
  usuario_id  uuid        not null references usuarios (id) on delete cascade,

  tipo        text        not null check (tipo in ('verificacao', 'recuperacao')),

  -- sha-256 do token, NUNCA o token — a mesma regra de `evento_acessos`. Quem lê
  -- o banco não ganha a capacidade de redefinir a senha de ninguém.
  token_hash  text        not null,

  expira_em   timestamptz not null,
  usado_em    timestamptz,

  criado_em   timestamptz not null default now()
);

-- Único SEM filtro parcial: um token usado continua ocupando o hash dele para
-- sempre, e é isso que garante que o mesmo valor não volte a valer.
create unique index if not exists usuario_tokens_hash_unico
  on usuario_tokens (token_hash);

create index if not exists usuario_tokens_usuario_idx
  on usuario_tokens (usuario_id, tipo) where usado_em is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- O vínculo: a sessão passa a poder apontar para uma conta
-- ─────────────────────────────────────────────────────────────────────────────
--
-- NULO CONTINUA VALENDO, e não é herança a limpar: o acesso do TELÃO e o do
-- MODERADOR não têm conta e não devem ter. Eles são links ao portador, entregues
-- a quem opera o projetor e a quem aprova foto — pedir cadastro a essas duas
-- pessoas seria transformar um link que se cola no navegador do salão numa tela
-- de senha às onze da noite.
alter table evento_acessos
  add column if not exists usuario_id uuid references usuarios (id) on delete set null;

-- É por este índice que o login descobre QUAL casamento é de quem entrou. Ele
-- não filtra `revogado_em`: o vínculo entre a conta e o casamento sobrevive à
-- revogação de uma sessão, e quem revoga o próprio cookie não deixa de ser dono
-- do próprio casamento.
create index if not exists evento_acessos_usuario_idx
  on evento_acessos (usuario_id);
