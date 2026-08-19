# casa-nos

Site de casamento multi-inquilino. O primeiro evento é o casamento de Ana Flávia
e Maxwel, em 22 de agosto de 2027, no Rio de Janeiro.

**`casa-nos` é nome de projeto, não marca.** Não há logotipo: o nome do casal é
o elemento gráfico da página, e o nome do produto aparece uma vez, como texto, no
rodapé.

---

## O que existe hoje

**Fatia 0 — a página pública.** Hero com os nomes e "save the date", data por
extenso, contagem regressiva ao vivo, seção "Onde" (cidade, mapa da região, local
e horário pendentes) e rodapé. Mobile primeiro — o visitante chega de um link no
WhatsApp, no celular, com uma mão.

**Fatia 1 · F1.1 e F1.2 — o acesso e o caminho da foto.**

- **O casal entra por link de e-mail** (30 minutos, uma vez só) e configura o
  dia: janela de envio, janela da festa, modo de moderação, moderador.
- **O convidado abre `/e/<slug>/album`** e a participação nasce na primeira
  resposta — sem cadastro, sem tela intermediária, sem pedir nada.
- **O botão de mandar não espera nada**: ele não depende de rede em caminho de
  código nenhum.
- **A foto não se perde quando o wifi cai.** A intenção é registrada no servidor
  **antes** dos bytes; a fila local em IndexedDB guarda o arquivo antes de
  qualquer rede, sobe prévia e original em faixas separadas, retenta sem limite e
  retoma sozinha quando o convidado reabre o link.
- **Erro de produção vira linha no banco** e alerta por e-mail ao dono.

**Fatia 1 · F1.3 — a pessoa, e a escolha dela.**

- **A lista de convidados** (`/painel/<id>/convidados`): o casal cola os nomes,
  `Família Silva, 4` vira um slot com quatro pessoas, e as linhas que a máquina
  não entendeu voltam com o motivo. É o denominador da métrica que decide o
  produto.
- **Os dois botões de envio SÃO a escolha de visibilidade**: `Mandar para a
  festa` e `Mandar só para os noivos`, com a mesma altura, a mesma largura e
  nenhum empurrão visual — a razão entre os cliques é o instrumento da hipótese
  central.
- **O nome é perguntado depois**, com o envio já correndo, e pode ser ignorado.
  A busca é local: funciona sem rede.
- **O envio termina em "as minhas fotos"** (`/e/<slug>/album/minhas`), onde cada
  foto responde a duas perguntas ao mesmo tempo — *quem vê isso?* e *já chegou?*
  — e a visibilidade volta atrás sem prazo.

**Fatia 1 · F1.4 — a prova pública.**

- **O feed da festa**, com rajada agrupada num cartão, paginação por cursor e
  sondagem barata a cada 5 s **só com a aba visível**. Novidade não empurra a
  tela: aparece um botão no topo.
- **O código para imprimir** (`/painel/<id>/materiais`): três formatos, com a
  origem por superfície (`?o=mesa`, `?o=cartaz`, `?o=telao`), gerados por um
  codificador de QR próprio e verificado contra os valores publicados da
  especificação.
- **O telão** (`/telao/<token>`): abre por link próprio, roda em silêncio, e
  **nunca projeta um erro na parede**. Perdeu a rede, perdeu o servidor: ele
  continua com o que já tem.

**Fatia 1 · F1.5 a F1.7 — o controle, a verdade e o loop. A fatia fecha aqui.**

- **A fila de aprovação** (`/painel/<id>/fila`) segura o feed e o telão, **nunca
  o acervo do casal**: com a moderação ligada, a foto é gravada, contada e fica
  com o casal na hora. "Aprovar as 400" é um toque e uma requisição.
- **O que chegou** (`/painel/<id>/midias`): `6.000 fotos, 5.412 em alta
  resolução` — dois números, nunca somados. Falha de leitura mostra um travessão
  e o motivo, **nunca um zero**.
- **A reconciliação** adota a foto cujos bytes chegaram e cuja confirmação se
  perdeu — quando o convidado reabre o álbum, e num cron diário às 12:00 UTC. A
  perda irrecuperável é uma consulta, e o valor esperado é **zero**.
- **O painel do dia** (`/painel/<id>/dia-ao-vivo`, **só o dono**): sete números,
  um por linha, atualizando a cada minuto, direto do Postgres. Inclui o sinal do
  telão — a única forma de descobrir que a parede congelou.
- **O CTA do loop** e o **link guardado**, abaixo da grade de "as minhas fotos" e
  só depois do primeiro envio concluído. O lead é gravado com a festa de origem
  **no servidor**, porque o loop não fecha por cookie.
- **Baixar a foto**, por URL assinada de 15 minutos, dizendo qual versão está
  baixando.
- **Toda foto `noivos` sai por URL assinada** (RN-33): `pub/` é servido, `prv/`
  não. Trocar uma foto para `noivos` **move os objetos de prefixo**, e a troca só
  é confirmada depois de o endereço público parar de responder — inclusive na
  borda.

O que **não** existe, de propósito, está em
[`docs/fatia-0.md`](docs/fatia-0.md), em
[`docs/fatia-1-f1-1-f1-2.md`](docs/fatia-1-f1-1-f1-2.md), em
[`docs/fatia-1-f1-3-f1-4.md`](docs/fatia-1-f1-3-f1-4.md) e em
[`docs/fatia-1-f1-5-f1-7.md`](docs/fatia-1-f1-5-f1-7.md).

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

### O caminho inteiro, na ordem em que ele acontece

Com o servidor no ar e o cookie de acesso do casal em mãos (ver
[Bootstrap](#bootstrap--é-assim-que-um-evento-nasce)):

| # | Onde | O que conferir |
|---|---|---|
| 1 | `/painel/<eventoId>/convidados` | Cole `Ana Paula Ribeiro`, `Família Silva, 4`, `, 4` e `Casal Lima, 2 pessoas`. **Duas linhas entram, duas voltam com o motivo** e o texto delas continua na caixa. Cole a mesma lista de novo: nada duplica |
| 2 | `/painel/<eventoId>/materiais` | Baixe os três. Abra o `.svg` e **leia o código com a câmera do celular** — é o critério de aceite da H-04, e ele é humano. Gere o **link do telão** e guarde: ele aparece uma vez |
| 3 | `/telao/<token>` | Abre direto na arte do vazio: nome, QR grande, "Aponte a câmera". **Nunca branco, nunca logo girando** |
| 4 | `/e/ana-e-max/album` | O botão de mandar está lá antes de o feed carregar. Escolha fotos: a folha abre com **os dois botões**, do mesmo tamanho |
| 5 | ainda no passo 4 | Toque em um dos dois. Você cai em `/e/ana-e-max/album/minhas` **com a pergunta do nome já aberta**, e o envio correndo por baixo |
| 6 | `/e/ana-e-max/album/minhas` | Cada foto tem o selo de **quem vê** (canto inferior esquerdo) e, enquanto sobe, o de **já chegou** (canto superior direito). Toque numa foto → `Mudar quem vê` |
| 7 | de volta ao telão | A foto aparece na parede em até 15 s, com fusão de 600 ms |
| 8 | ainda no passo 6 | Tire a foto do feed (`Só para os noivos`). Ela some da parede na sondagem seguinte |

**Para ver os estados que dependem de data**, mexa na janela em
`/painel/<eventoId>/dia`:

- janela **abrindo amanhã** → o álbum mostra `Você chegou antes da festa`, com a
  data, e **sem botão de mandar**;
- janela **já fechada** → `Os envios deste casamento foram encerrados.`, também
  sem botão. O feed continua visível nos dois.

**Para ver o telão sem rede:** abra o `/telao/<token>`, deixe algumas fotos
entrarem no buffer e desligue o wifi. Ele **continua girando as fotos que já
tem**, sem nenhum aviso — que é a especificação, e é a parte difícil de acreditar
sem ver.

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
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | para o envio | a rota de intenção responde 503 **e a linha de intenção fica gravada** — o servidor sabe que a foto existe, e a reconciliação vai procurá-la |
| `R2_PUBLIC_BASE` | para **ver** as fotos | a grade renderiza os tiles sem imagem e nada quebra: as telas abrem, o botão de mandar funciona e o envio acontece. Ver [ADR 0005](docs/adr/0005-leitura-de-midia-por-base-publica.md) |
| `BREVO_API_KEY`, `BREVO_REMETENTE` | para o link do casal | nenhum e-mail sai; a tela não mente dizendo que mandou. Entre pelo cookie que o bootstrap imprime |
| `ALERTA_EMAIL` | não | o alerta de taxa de erro não sai; o registro em `eventos_de_erro` continua |
| `CRON_SEGREDO` | F1.6 | a sessão de cron nunca é reconhecida — o lado seguro de errar |

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

**A numeração pula de `0007` para `0010`, e é de propósito.** O PRD reserva a
`0008` às views de medição (§5.7) e a `0009` a `leads` (§5.8) — as duas são das
sub-fatias F1.6 e F1.7, e estão escritas lá com esses números. A tabela de erro
da H-18 entrou como `0010` para não tomar o número de ninguém. O runner ordena
por nome; buraco na sequência não quebra nada.

### Bootstrap — é assim que um evento nasce

Não existe cadastro público na Fatia 1 (decisão P4 do PRD): não há página de
aquisição, e a estratégia proíbe vender ao segundo casal antes do primeiro
casamento. O evento nasce por script, e o casal entra por link.

```bash
pnpm db:bootstrap db/seed/casamento-ana-e-max.json --dono
pnpm db:bootstrap db/seed/casamento-de-teste.json
```

**Rode os dois.** O segundo evento não é enfeite: o teste de vazamento entre
inquilinos é critério de término da fatia, e ele é invisível com um inquilino só.
Acrescentar o segundo depois significa auditar cada consulta escrita até ali.

O script imprime **uma vez** o valor do cookie de acesso do casal — no banco só
existe o hash. Se o `email_casal` estiver preenchido, o caminho normal é pedir o
link na tela de entrada, que manda por e-mail (Brevo).

`--dono` marca o acesso do dono do produto, que é quem enxerga a medição. No
casamento cobaia o dono **é** o casal; no evento de teste, ninguém é dono.

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
pnpm verificar    # tsc --noEmit && eslint && vitest run && ds-check && contrato
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
| `test/analytics-sem-pii.test.tsx` | monta a página, aciona os eventos e varre **o que saiu** para o GA4 atrás do nome do casal |
| `test/analytics-privacidade.test.ts` | o mascaramento de URL, inclusive nas rotas que ainda não existem |
| `test/analytics-gtag-unico.test.ts` | ninguém fala com o `gtag` fora de `lib/analytics.ts` |
| `scripts/ds-check.mjs` (no `build`) | contagem de desvios de design system; falha se subir |
| `test/intencao-antes-dos-bytes.test.ts` | **a linha de intenção existe antes de a URL ser assinada** — e continua existindo se a assinatura falhar |
| `test/fila-motor.test.ts` | o salão dentro do CI: modo avião, portal cativo, 500, URL vencida, retomada |
| `test/fila-maquina.test.ts` | recuo com teto, classificação de falha, ordem das faixas |
| `test/janela-de-envio.test.ts` + `.brasilia.test.ts` | a mesma janela em `TZ=UTC` **e** em `TZ=America/Sao_Paulo` |
| `test/autorizacao-matriz.test.ts` | `cookies()` num arquivo só; nenhum `if` de perfil em rota; toda rota na matriz |
| `test/vazamento-inquilinos.test.ts` | inquilino A não lê o B, agora com participação, acesso e mídia |
| `test/analytics-mascara-rotas.test.ts` | nenhuma rota manda identificador legível ao GA4 — inclusive as que ainda não existem |
| `test/r2-assinatura.test.ts` | o layout das chaves no R2 (mudar depois é migração de blob) |
| `test/observabilidade-sem-pii.test.ts` | o registro de erro não guarda nome, e-mail nem telefone |
| `test/telas-fatia-1.smoke.test.tsx` | as telas da F1.1 e da F1.2 montadas, com o texto exato e o atalho de teclado |
| `test/qr.test.ts` | o codificador de QR contra os valores publicados da especificação, **e o caminho de volta**: a matriz é lida e o que sai é o que entrou |
| `test/convidados.test.ts` | a caixa de colar: a vírgula da direita, as linhas recusadas, o teto de 300, a reimportação que não duplica |
| `test/minhas-e-visibilidade.test.ts` | as duas perguntas em campos separados; **um** caminho de escrita para `midias.visibilidade`; palavra terminal e os dois tetos de caracteres |
| `test/feed.test.ts` | os quatro filtros do feed, o telão com o **mesmo** recorte, o agrupamento no banco e o cursor |
| `test/telao.test.ts` | cinco variantes e nenhuma a mais, cores de estado desligadas, o palco pintando o próprio chão, e as nove proibições da parede varridas no código |
| `test/medida-do-dia.test.ts` + `.brasilia.test.ts` | `days_since_event` e a data anunciada, nos **dois** fusos |
| `test/telas-f1-3-f1-4.smoke.test.tsx` | as quatro telas novas montadas, com o texto exato do `gtm.md` |
| `test/openapi.test.ts` | o contrato gerado bate com `lib/rotas.ts` |
| `pnpm contrato` (no `build`) | `docs/openapi-casa-nos.json` regenerado no mesmo commit da rota |
| `test/visibilidade-move-objetos.test.ts` | **a foto que vira `noivos` sai de `pub/`** — a ordem dos quatro passos, e a troca falhando inteira quando a borda ainda responde |
| `test/r2-assinatura.test.ts` | os dois prefixos do balde; a URL de `noivos` **nunca** contém o domínio público; sem R2 ela é `null`, e não a pública |
| `test/rota-curta.test.ts` | **toda pasta de primeiro nível de `app/` está reservada** — uma pasta nova rouba, em silêncio, o endereço de um casamento já impresso |
| `test/moderacao.test.ts` | a fila filtra `feed`, aprova em lote numa instrução, e o álbum do convidado não conhece a palavra "aprovação" |
| `test/leads.test.ts` | a origem do lead vem da URL e nunca do corpo; o WhatsApp não sai para o GA4; `cta_surface = feed` não é emitido |
| `test/reconciliacao.test.ts` | a adoção usa a data do OBJETO, é idempotente, e original sem prévia vira marca — não perda |
| `test/analytics-dicionario.test.ts` | a união tem exatamente os 16 eventos da fatia, todos documentados, e **nenhum parâmetro aceita texto livre** |
| `test/medicao.test.ts` + `.brasilia.test.ts` | as sete linhas nos dois fusos; `numeric` vira número na fronteira; a linha que falha não derruba as outras seis |
| `test/telas-f1-5-f1-7.smoke.test.tsx` | fila, painel e dia ao vivo montados, com o texto exato — e o CTA **não existindo** antes do primeiro envio |
| `test/contadores-vs-verdade.test.ts` | **banco real**: o agregado do casal contra `count(*)` depois de centenas de operações |
| `test/perda-vs-verdade.test.ts` | **banco real**: a consulta de perda diz 0 hoje e diz 3 depois de D+7 — a prova de que ela não está cega |

**O que ele NÃO cobre, e nenhum comando cobre:**

- **Layout.** Uma página que renderiza inteira torta passa em verde. Verificação
  de pixel exige navegador, e não existe substituto honesto — quem resolve isso é
  o olho humano no preview.
- **Usabilidade e clareza do texto.**
- **A viagem até o Neon.** Quase todo o caminho de dados é testado com um banco
  falso que imita os tipos que o Postgres devolve (`numeric` como string, `date`
  como texto). **Duas exceções, e elas rodam contra o banco de verdade quando há
  `DATABASE_URL`:** `contadores-vs-verdade` (o agregado do casal) e
  `perda-vs-verdade` (a consulta que decide a fatia). Sem a variável, as duas se
  pulam sozinhas e dizem isso — fingir que passaram seria pior.
- **O balde.** Sem credencial de R2 não há objeto para copiar nem endereço para
  conferir. A coreografia da RN-33 é verificada por uma porta
  (`ClienteDeObjetos`) com um balde falso: a **ordem** dos passos e a recusa
  quando a borda não confirma são provadas; que o domínio público esteja
  configurado só no prefixo `pub/` é configuração, e está escrita no
  `.env.example`.
- **Escala.** `pnpm verificar` não sobe 200 clientes. Quem faz isso é
  `pnpm carga`, e o resultado está em
  [`docs/carga-fatia-1.md`](docs/carga-fatia-1.md).

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

**O cron diário está em `vercel.json`: `0 12 * * *`, que é 12:00 UTC / 9h de
Brasília.** O horário obedece à regra da casa (job que fala com API de terceiro
roda entre 12 e 20 UTC) e evita o único horário proibido de verdade: um cron às
3h UTC rodaria à meia-noite de Brasília, no meio de uma festa, quando as escritas
do produto estão no pico.

Configure `CRON_SEGREDO` na Vercel **e** como `CRON_SECRET` do projeto: o
agendador chama por `GET` com `Authorization: Bearer`, e a rota aceita as duas
formas. **Sem o segredo configurado, a rota responde 401** — nunca "passa porque
a variável está vazia".

**O que ainda não existe, e está declarado:** um vigia que avise quando o cron
*não* rodar. Um processo não consegue avisar que não rodou. O que existe no lugar
é evidência onde uma pessoa olha — `evento_contadores.recomputado_em` viaja no
painel do dia ao vivo, ao lado do sinal do telão. Um vigia de verdade é um
serviço externo batendo numa rota, e é configuração.

---

## Analytics

Dicionário de eventos em [`docs/analytics.md`](docs/analytics.md). Nenhum evento
existe fora dele, e a assinatura é tipada — nome errado quebra o `tsc` em vez de
sumir em silêncio no relatório, que o GA4 não preenche retroativamente.

**Nenhuma PII, e isso é catraca, não promessa.** Nenhuma URL do produto chega ao
GA4 legível: `page_location`, `page_title` e `page_referrer` são declarados em
todo hit e mascarados para `https://casa-nos.invalid/e/<wedding_id>`. O
identificador que viaja é o `wedding_id`, que é opaco. O modo de consentimento
nasce em `denied`, sem banner.

O motivo de cada uma dessas escolhas — e o que saía antes, medido no fio — está
em [`docs/adr/0003-url-mascarada-e-consentimento-negado.md`](docs/adr/0003-url-mascarada-e-consentimento-negado.md).

---

## Documentação

- [`docs/fatia-0.md`](docs/fatia-0.md) — o que ficou de fora, de propósito
- [`docs/fatia-1-f1-1-f1-2.md`](docs/fatia-1-f1-1-f1-2.md) — o que entrou na F1.1 e na F1.2, o que ficou de fora e por quê, e o que faltou nos documentos
- [`docs/fatia-1-f1-3-f1-4.md`](docs/fatia-1-f1-3-f1-4.md) — a F1.3 e a F1.4: o QR escrito à mão, o telão que não pode contar que quebrou, e o que **não** foi provado sobre o feed com 6.000 itens
- [`docs/fila-local.md`](docs/fila-local.md) — **o contrato do registro no IndexedDB**. Leia antes de mexer na fila
- [`docs/analytics.md`](docs/analytics.md) — dicionário de eventos GA4
- [`docs/openapi-casa-nos.json`](docs/openapi-casa-nos.json) — contrato da API, **gerado**: não edite a mão
- [`docs/adr/0001-evento-como-inquilino.md`](docs/adr/0001-evento-como-inquilino.md)
- [`docs/adr/0002-mapa-sem-chave-de-api.md`](docs/adr/0002-mapa-sem-chave-de-api.md)
- [`docs/adr/0003-url-mascarada-e-consentimento-negado.md`](docs/adr/0003-url-mascarada-e-consentimento-negado.md)
- [`docs/adr/0004-erro-em-tabela-do-proprio-banco.md`](docs/adr/0004-erro-em-tabela-do-proprio-banco.md)
- [`docs/fatia-1-f1-5-f1-7.md`](docs/fatia-1-f1-5-f1-7.md) — a F1.5 a F1.7: a moderação, os números honestos, a reconciliação, o loop, e o que ficou de fora
- [`docs/carga-fatia-1.md`](docs/carga-fatia-1.md) — **o teste de carga com 200 clientes**: os números, o que quebrou primeiro, e o veredito sobre a virtualização
- [`docs/adr/0005-dois-prefixos-no-balde.md`](docs/adr/0005-dois-prefixos-no-balde.md) — **`pub` é servido, `prv` não**, e o que acontece quando uma foto muda de visibilidade
- [`docs/adr/0005-leitura-de-midia-por-base-publica.md`](docs/adr/0005-leitura-de-midia-por-base-publica.md) — a primeira redação do 0005, **rejeitada**, e por que a lápide fica

---

## Convenções

- Comentário explica **por quê**, não o quê. Comentário que registra um bug real
  vale mais que dez descrevendo sintaxe.
- Commit em português, sem acento, descrevendo o efeito para quem usa:
  `fix(site): a data do casamento aparecia um dia antes no servidor em UTC`.
- Cor nunca é literal: ela vem de `lib/tokens.ts` ou não existe.
- Componente visual vem do MUI. `components/ui/` não nasce.
- Tailwind só posiciona.
