# casa-nos

Site de casamento multi-inquilino. O primeiro evento é o casamento de Ana Flávia
e Maxwel, em 22 de agosto de 2027, no Rio de Janeiro.

**`casa-nos` é nome de projeto, não marca.** Não há logotipo: o nome do casal é
o elemento gráfico da página, e o nome do produto aparece uma vez, como texto, no
rodapé.

---

## O que existe hoje (Fatia 0)

Uma página pública por casamento: hero com os nomes e "save the date", a data por
extenso, contagem regressiva ao vivo, a seção "Onde" (cidade, mapa da região,
local e horário pendentes) e rodapé. Mobile primeiro — o visitante chega de um
link no WhatsApp, no celular, com uma mão.

O que **não** existe, de propósito, está em [`docs/fatia-0.md`](docs/fatia-0.md).

---

## Stack

Next.js 16 (App Router) · TypeScript · MUI · Tailwind **só para layout** · Neon
Postgres com migrations SQL versionadas · GA4 · Vercel.

---

## Como rodar

```bash
pnpm install
cp .env.example .env.local      # e preencha os valores
pnpm db:migrar                  # cria o schema
pnpm db:seed                    # grava o conteúdo do casamento
pnpm dev                        # http://localhost:3000
```

Sem `DATABASE_URL` o servidor sobe, mas toda página responde 500 com a mensagem
`DATABASE_URL não configurada`. É o comportamento certo: um site de casamento sem
banco não tem o que mostrar, e falhar em silêncio seria pior.

Em `localhost` o domínio não bate com nenhum cadastro, então o evento vem de
`EVENTO_SLUG_PADRAO` (use `ana-e-max`). Sem essa variável, `/` responde 404 e
`/e/ana-e-max` continua funcionando.

---

## Variáveis de ambiente

Os **nomes** estão em [`.env.example`](.env.example), com o que cada uma faz.
Valor não entra no repositório — nem exemplo, nem truncado. Eles vivem só no
painel da Vercel e no do Neon.

| Nome | Obrigatória | Sem ela |
|---|---|---|
| `DATABASE_URL` | sim | toda página responde 500 |
| `EVENTO_SLUG_PADRAO` | só fora de produção | `/` responde 404 em localhost e no preview |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | não | o GA4 não carrega — nenhum script, nenhum cookie |

---

## Banco

### Migrations

```bash
pnpm db:migrar            # aplica o que falta
pnpm db:migrar --status   # lista sem aplicar
```

- Arquivos em `db/migrations/`, numerados, aplicados em ordem, uma vez cada
  (controle na tabela `_migracoes`).
- **Migration aplicada é imutável.** Corrigir é escrever a próxima.
- **DDL na mão no console é proibida.** No instante em que alguém roda um `ALTER
  TABLE` no painel do Neon, o schema de produção vira algo que só o banco conhece
  e nenhum ambiente novo consegue mais ser reconstruído.
- Toda instrução é idempotente (`create ... if not exists`). O motivo é o driver:
  o Neon por HTTP executa uma instrução por requisição, sem transação em volta do
  arquivo. Se a quinta falhar, as quatro primeiras ficaram — e idempotente
  significa que consertar e rodar de novo é seguro.

A migration `0001` foi executada contra um Postgres real, duas vezes seguidas,
para provar que roda e que é idempotente.

### Seed — é assim que o dono edita o site

**Não existe painel administrativo nesta fatia.** O conteúdo mora em
`db/seed/casamento-ana-e-max.json`; o dono edita o arquivo e roda:

```bash
pnpm db:seed
```

O seed é idempotente (a chave é o `slug`) e confere o arquivo **antes** de tocar
no banco: data em formato brasileiro, horário publicado sem horário preenchido,
nome de local publicado sem nome, coordenada faltando — cada um vira uma mensagem
que diz o que corrigir, em vez de um erro de constraint no meio da escrita.

As indicações são reescritas a cada seed: o arquivo é a fonte da verdade, então
tirar um hotel do JSON tira o hotel do site (por exclusão lógica — dá para
recuperar).

O que o dono muda sem tocar em código, e sem deploy:

| Para | Mude no JSON | e rode |
|---|---|---|
| Divulgar o horário | `horaEvento` + `horaPublicada: true` | `pnpm db:seed` |
| Divulgar o nome do local | `localNome` + `localNomePublicado: true` | `pnpm db:seed` |
| Trocar a região pelo endereço exato | `localRevelacao: "exato"` + `localEndereco` | `pnpm db:seed` |
| Acrescentar hotéis e dicas | `indicacoes: [...]` | `pnpm db:seed` |
| Tirar o site do ar | `publicado: false` | `pnpm db:seed` |

---

## Multi-inquilino

**O evento é o inquilino.** Não existe "o site do casamento da Ana e do Maxwel"
no código: existe um produto de casamentos cujo primeiro inquilino é o deles.

```
eventos                 ← a raiz
├── evento_dominios     ← anaemax.com.br  →  qual casamento
└── evento_indicacoes   ← hospedagem e dicas, com evento_id
```

A requisição vira inquilino em `lib/resolver-evento.ts`, nesta ordem: **domínio**
(produção) → **`EVENTO_SLUG_PADRAO`** (localhost e preview) → **404**. Domínio
desconhecido nunca cai no "primeiro casamento da lista" — é assim que um produto
multi-inquilino mostra o casamento errado para o convidado errado.

Um segundo casal entra com dois `INSERT` (um em `eventos`, um em
`evento_dominios`) e o domínio apontado. **Sem migration e sem deploy.**

Toda consulta filtra por `evento_id` no servidor, nunca por id vindo do cliente.
`test/eventos-escopo.test.ts` roda com dois casamentos e prova que um não lê o
outro — o teste tem dois inquilinos desde a primeira linha porque vazamento entre
inquilinos é invisível em teste com um só.

---

## O mapa, e por que ele não tem pin

O casal quer **o mapa visível e o nome do local escondido**. São duas decisões
independentes e por isso são dois campos com flags separadas.

`eventos.local_revelacao` tem três valores:

| Valor | O que a página mostra |
|---|---|
| `oculto` | só a cidade e "o local entra aqui assim que for definido" |
| `regiao` | mapa afastado com a **área** destacada, **sem marcador**, sem endereço |
| `exato` | pin, endereço e link de rotas |

Hoje vale `regiao`. O ponto guardado no banco é o **centro aproximado de uma área
de 4 km**, não o endereço — de propósito, para que nem o código-fonte da página
nem o link do mapa permitam inferir o estabelecimento. O mesmo componente desenha
os três estados: revelar é um `UPDATE`.

**Mapa sem chave de API**, montado com tiles do OpenStreetMap (`lib/mapa.ts`).
Não é só custo: uma chave do Google Maps num site público é uma chave exposta,
com cota que qualquer um pode gastar.

As tiles e a área destacada penduram na **mesma âncora** (o ponto central, em
50%/50% do contêiner), então a área fica centrada no ponto guardado em qualquer
largura de tela — por construção, e não por ajuste. `test/mapa.test.ts` prova a
aritmética; a conferência no navegador cobre o resto.

A primeira versão usava o iframe de embed do OSM e **errava o alvo em cerca de
2 km**, diferente em cada largura de tela, porque o embed reserva parte da
própria altura para a barra de atribuição. O ADR 0002 conta a história inteira e
por que nenhum recorte do iframe resolvia.

O crédito da licença é texto nosso, abaixo do mapa, com link vivo — dentro do
embed ele existia com os links mortos.

> **Confira o ponto.** A coordenada no seed (`-22.97, -43.37`, região
> Jacarepaguá/Barra) foi escolhida como centro genérico da região, sem consultar
> o endereço do local. Se a região estiver errada, corrija no JSON e rode o seed.

---

## Verificação

```bash
pnpm verificar    # tsc --noEmit && eslint && vitest run && ds-check
```

Um comando só, porque verificação que exige lembrar de rodar três comandos vira
verificação que ninguém roda. Ele roda no CI e deve rodar no hook de pré-commit.

**O que ele cobre:**

| Catraca | O que segura |
|---|---|
| `tsc --noEmit` | tipos, incluindo os nomes de evento do GA4 (evento inexistente não compila) |
| ESLint | `#hex`/`rgb()` em `app/` e `components/`; import de `components/ui`; `any` |
| `test/rotas.smoke.test.tsx` | toda página carrega e a página monta nos estados que tem |
| `test/rotas-id-validado.test.ts` | toda rota com `[param]` valida o formato **antes** de consultar |
| `test/eventos-escopo.test.ts` | inquilino A não lê o B; o que o casal escondeu não sai do servidor |
| `test/datas.test.ts` | data e fuso, **rodando com `TZ=UTC`** |
| `test/sql-instrucoes.test.ts` | o separador de instruções do runner de migration |
| `test/pagina-com-dados-do-seed.test.tsx` | o conteúdo real, do arquivo de seed até o texto na tela |
| `test/mapa.test.ts` | a área do mapa cai sobre o ponto guardado, em qualquer largura |
| `test/design-system.test.ts` | mede o código de hoje **e** prova que a catraca ainda acusa desvio |
| `scripts/ds-check.mjs` (no `build`) | contagem de desvios de design system; falha se subir |

**O que ele NÃO cobre, e nenhum comando cobre:**

- **Layout.** Uma página que renderiza inteira torta passa em verde. Verificação
  de pixel exige navegador, e não existe substituto honesto — quem resolve isso é
  o olho humano no preview.
- **Usabilidade e clareza do texto.**
- **A viagem até o Neon.** Todo o caminho de dados é testado com um banco falso
  que imita os tipos que o Postgres devolve (`numeric` como string, `date` como
  texto). O trecho que vai pela rede só se verifica com o banco real no ar.

A catraca do design system nasceu com todos os números em **zero**. Ela está em
modo contagem (falha se subir), que na prática já é proibição — não aumente o
teto em `design-system.baseline.json` sem o motivo escrito na mensagem do commit.

---

## Deploy

1. Projeto novo na Vercel apontando para este repositório.
2. Variáveis de ambiente no painel: `DATABASE_URL` e
   `NEXT_PUBLIC_GA_MEASUREMENT_ID`. **Não** configure `EVENTO_SLUG_PADRAO` em
   produção — lá quem resolve o inquilino é o domínio.
3. Banco Neon criado e `pnpm db:migrar` + `pnpm db:seed` executados uma vez
   (com a `DATABASE_URL` de produção no `.env.local` local, ou por um job).
4. Domínio `anaemax.com.br` adicionado ao projeto na Vercel, com o DNS apontado.
5. A linha em `evento_dominios` já cadastra `anaemax.com.br` pelo seed. Se o
   domínio final for outro, acrescente em `dominios` no JSON e rode o seed.

O `build` roda `ds-check` antes do `next build`: desvio de design system não faz
deploy.

---

## Analytics

Dicionário de eventos em [`docs/analytics.md`](docs/analytics.md). Nenhum evento
existe fora dele, e a assinatura é tipada — nome errado quebra o `tsc` em vez de
sumir em silêncio no relatório, que o GA4 não preenche retroativamente.

Nenhuma PII: o convidado desta fatia não tem conta e não é identificado. O único
identificador enviado é `wedding_id`, o uuid do evento.

---

## Documentação

- [`docs/fatia-0.md`](docs/fatia-0.md) — o que ficou de fora, de propósito
- [`docs/analytics.md`](docs/analytics.md) — dicionário de eventos GA4
- [`docs/adr/0001-evento-como-inquilino.md`](docs/adr/0001-evento-como-inquilino.md)
- [`docs/adr/0002-mapa-sem-chave-de-api.md`](docs/adr/0002-mapa-sem-chave-de-api.md)

---

## Convenções

- Comentário explica **por quê**, não o quê. Comentário que registra um bug real
  vale mais que dez descrevendo sintaxe.
- Commit em português, sem acento, descrevendo o efeito para quem usa:
  `fix(site): a data do casamento aparecia um dia antes no servidor em UTC`.
- Cor nunca é literal: ela vem de `lib/tokens.ts` ou não existe.
- Componente visual vem do MUI. `components/ui/` não nasce.
- Tailwind só posiciona.
