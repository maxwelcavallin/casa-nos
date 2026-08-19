# Fatia 1 · F1.1 e F1.2 — o que entrou, e o que ficou de fora de propósito

**Data:** 19/08/2026 · **Autor:** dev-fullstack
**Histórias:** H-01, H-02, H-05, H-06, H-07, H-18

Como em `docs/fatia-0.md`: **cada ausência aqui é uma decisão, com motivo, e com
o lugar onde ela volta.** Ausência escrita é decisão; ausência não escrita é
esquecimento.

---

## O que entrou

### F1.1 — o chão

- **H-01** `lib/sessao.ts` resolve os quatro portadores (participação, casal,
  moderador, telão) e devolve uma união discriminada. É o **único** arquivo do
  produto que chama `cookies()`, e um teste varre `app/**` para garantir.
  `lib/autorizacao.ts` traz a §7 do PRD inteira como dado, com `pode()`.
- **H-02** `/painel/[eventoId]/dia`: janela de envio, janela da festa, modo de
  moderação, moderador exigido na fila, contagem de presentes depois da festa.
  Entrada por link de e-mail (30 minutos, uma vez só) → cookie httpOnly de 30
  dias.
- **Bootstrap de dois eventos** (`scripts/bootstrap.mjs` + `db/seed/casamento-de-teste.json`),
  porque o teste de vazamento entre inquilinos é critério de término e ele é
  invisível com um inquilino só.

### F1.2 — a foto chega

- **H-05** `/e/[slug]/album`: participação criada **na primeira resposta** (pelo
  `proxy.ts`), botão de enviar que não depende de rede nenhuma, atalho de teclado
  em dois passos, regiões nomeadas, service worker da casca, `noindex`, limite de
  taxa.
- **H-06** `POST /api/eventos/[id]/midias/intencao` — a linha em `midias` nasce
  **antes** de qualquer URL ser assinada — e `POST .../[midiaId]/confirmacao`,
  idempotente por faixa.
- **H-07** a fila local em IndexedDB, as duas faixas, o recuo com teto, a
  retomada sozinha, a recusa de vídeo no aparelho e as derivadas sem EXIF.
- **H-18** `eventos_de_erro` (ADR 0004), o invólucro que embrulha toda rota, o
  relato do cliente e o alerta de taxa por e-mail.

### As catracas novas

| Catraca | Onde | Estado |
|---|---|---|
| Nenhum `cookies()` fora de `lib/sessao.ts` | `test/autorizacao-matriz.test.ts` | zero — proibição |
| Nenhum `if` de perfil em `app/api/**` | idem | zero — proibição (**pegou um caso meu**) |
| Toda rota aparece na matriz, e todo método declarado | idem | zero — proibição |
| Vazamento entre inquilinos, varrendo a lista de rotas | `test/vazamento-inquilinos.test.ts` | zero |
| Janela em `TZ=UTC` **e** `TZ=America/Sao_Paulo` | projeto `fuso-brasilia` do vitest | zero |
| Máscara de PII sobre a lista de rotas | `test/analytics-mascara-rotas.test.ts` | zero |
| `setCarregando(false)` fora de `finally` | `scripts/ds-medidas.mjs`, modo contagem | **0** |
| `docs/openapi-casa-nos.json` regenerado | `pnpm contrato`, dentro do `build` | — |

---

## A numeração das migrations: 0007 → **0010**

**Foi deliberado.** `0008` está reservada às views de medição (PRD §5.7) e
`0009` a `leads` (PRD §5.8) — as duas são da F1.6 e da F1.7, e estão escritas no
PRD com esses números. Tomar o número delas obrigaria a renumerar migrations
especificadas por outra pessoa, e número de migration é combinado entre
documentos, não detalhe de arquivo.

A tabela de erro entrou como **`0010_eventos_de_erro.sql`**. O runner ordena por
nome; buraco na sequência não quebra nada.

| Arquivo | História |
|---|---|
| `0002_dia_do_evento.sql` | H-02 |
| `0003_evento_acessos.sql` | H-01, H-02 |
| `0004_convidados.sql` | **schema só** — `participacoes` tem FK para cá. A tela é a H-03 (F1.3) |
| `0005_participacoes.sql` | H-01, H-05 |
| `0006_midias.sql` | H-06 |
| `0007_evento_contadores.sql` | escrito pela H-06; o painel que lê é a H-14 (F1.5) |
| *0008 — reservada* | views de medição, PRD §5.7 (F1.6) |
| *0009 — reservada* | `leads`, PRD §5.8 (F1.7) |
| `0010_eventos_de_erro.sql` | H-18 · ADR 0004 |

---

## O que ficou de fora, e por quê

| Fora | Por quê | Onde volta |
|---|---|---|
| **A grade do feed no álbum** | O feed é a H-11, e a rota `GET /api/eventos/[id]/feed` é dela. A região "Fotos da festa" existe, nomeada, e mostra o estado vazio — que é o estado real do álbum até a primeira foto chegar | F1.4 |
| **A folha de envio com os dois botões** | Os dois botões **são** a escolha de visibilidade (H-10), e o equilíbrio visual entre eles é a coisa medida da hipótese S1. Construir a folha agora com um botão só criaria exatamente o empurrão que a §17.2 item 19 proíbe, e ela seria refeita | F1.3 (H-10) |
| **"As minhas fotos"** | H-08. Sem ela, a fila local conta a verdade pelo indicador de envio | F1.3 |
| **Identificação (o nome como rótulo)** | H-09, e ela depende da lista de convidados (H-03) | F1.3 |
| **Telão, `PalcoTelao`, `temaTelao`** | H-12, F1.4. Os tokens de projeção (`corProjecao`, `escalaProjecao`, `variaveisCssProjecao`) **já estão** em `lib/tokens.ts`, sincronizados com a v3 — eles são a decisão registrada. O tema e o componente nascem com a tela: um `temaTelao` montado sem tela é código morto que parece funcionalidade | F1.4 |
| **Reconciliação e as views de veredito** | H-15, F1.6. **A linha de intenção já é gravada**, que é o pré-requisito — sem ela a reconciliação não teria o que procurar | F1.6 |
| **Cron diário** | F1.6. Por isso dois dos três alertas da H-18 não existem ainda (ver abaixo) | F1.6 |
| **Painel de mídias, fila de aprovação, CTA, leads** | H-13, H-14, H-16 | F1.5 e F1.7 |
| **Revogar/copiar o link do telão na tela do dia** | A rota existe (`POST`/`DELETE /api/eventos/[id]/acessos`) e é testada; a tela só **lista** os moderadores. O fluxo de copiar link e o diálogo de revogação são da H-04 (materiais), onde o QR e os links vivem juntos | F1.4 |
| **`app/icon.png`** | Fora do pedido, e o nome do local continua oculto | — |

### Dos três alertas da H-18, um existe

| Alerta | Estado |
|---|---|
| Taxa de erro `servidor` acima de 2% dos envios em 15 min | **existe**, por e-mail (Brevo), com piso de 5 erros e debounce de 30 min |
| Adoções por reconciliação acima de 5 numa hora | **não existe** — a reconciliação é da F1.6. Um alerta sobre um processo que não roda dispara sobre nada |
| O cron diário não rodou | **não existe** — o cron é da F1.6. Um alerta que nunca dispara ensina a ignorá-lo |

O canal está escolhido e funcionando (Brevo, o mesmo do link do casal), o que
cumpre a exigência de "escolhido antes do ensaio".

---

## Como eu provei que a intenção precede os bytes

`test/intencao-antes-dos-bytes.test.ts`, quatro afirmações:

1. **O assinador observa o banco no instante em que é chamado.** Um espião que só
   contasse chamadas provaria que as duas funções rodaram, não que a linha
   existia. Ele confere que a mídia está lá, com `estado = 'intencao'`.
2. **A chave assinada carrega o id da linha.** É o que torna "não pode haver
   objeto no R2 sem linha no banco" uma propriedade do layout de chave (PRD
   §5.5), e não uma promessa.
3. **Assinatura que estoura deixa a linha viva**, e a rota responde 500 no formato
   único. É a foto que a reconciliação vai procurar.
4. **Repetir o lote devolve 200 e uma linha só**, com URLs renovadas (RN-27).

**Se o navegador morrer entre a intenção e o `PUT`:** a linha fica em `intencao`,
sem `previa_armazenada_em`. O item continua no IndexedDB do aparelho e sobe na
próxima abertura (retomada). Se o aparelho nunca mais voltar, a mídia aparece na
consulta de perda (RN-14) a partir de D+7 — que é a verdade, e é o número que o
projeto quer ver. **Nada some em silêncio.**

---

## O que foi testado contra rede degradada, e o que não foi

**Testado de verdade, no CI** (`test/fila-motor.test.ts`, com a rede injetada):

- modo avião intermitente — três falhas seguidas e depois sucesso, com **um**
  evento por faixa e o item saindo da fila só com as duas confirmadas;
- **portal cativo** respondendo HTML com status 200 — o caso que, sem tratamento,
  faz a foto evaporar com o produto dizendo que deu certo;
- 500 do servidor, com `error_kind` correto e relato ao servidor;
- URL assinada vencida depois de uma noite → a intenção é repetida antes de
  qualquer `PUT`;
- 409 fora da janela → a fila **para**, e nada é perdido;
- dez falhas seguidas → o item continua lá (nenhum limite de tentativas);
- retomada num "aparelho novo" sobre o mesmo disco;
- o blob de uma faixa apagado ao confirmar, e o original preservado até o fim.

**Não testado — só verificável em aparelho de verdade, e está na lista do
ensaio:**

- throughput real no uplink do salão e o número de convidados simultâneos (H-21);
- congelamento de aba do iOS (a interface **não promete** segundo plano);
- IndexedDB sob pressão de espaço, e a recusa de `navigator.storage.persist()`;
- o service worker servindo a casca offline num navegador real;
- a geração das derivadas por `canvas` — no CI ela é injetada, porque jsdom não
  tem canvas. **A remoção de EXIF é propriedade do `toBlob`** (ele re-codifica a
  partir dos pixels), não de código nosso, mas **ainda não foi conferida num
  arquivo real**: entra na lista do ensaio, com leitura de metadado das três
  chaves no R2 (RN-18).

---

## O que faltou nos documentos, e como eu contornei

| # | O buraco | O que eu fiz |
|---|---|---|
| 1 | **Não existe copy para "a janela ainda não abriu".** O `gtm.md` §5.1 e a H-05 tratam "fora da janela" como um caso só, com a frase *"Os envios deste casamento foram encerrados."* — que lê errado na véspera da véspera | Implementei o estado único do PRD. O código já distingue os dois instantes (`estadoDoEnvio`), então a frase nova é uma linha quando o `pmm` escrever. **Precisa de decisão** |
| 2 | **A H-02 pede "revogar o link do telão" na tela do dia; o `gtm.md` dá o texto do diálogo; nenhum dos dois diz como o link é CRIADO ali** | As rotas existem e são testadas; a tela lista moderadores e não gera link. O fluxo completo vive com o QR (H-04, F1.4). **Registrado, não decidido por mim** |
| 3 | **`metricas.md` §6 lista `media_visibility` com três valores (`feed`, `noivos`, `ambos`); o PRD §3.1 V1 mata o `ambos`** | Vale o PRD: a união de tipos tem dois valores, e `ambos` não compila. Como `metricas.md` §5.3 exige que o `CHECK` e a dimensão sejam a mesma palavra, **`ambos` precisa sair do GA4 antes de a dimensão ser registrada** — o prazo é do `product-analytics` |
| 4 | **`error_kind` tem três valores no dicionário (`rede`, `servidor`, `arquivo`) e o portal cativo é um quarto estado do produto** | O portal viaja como `rede` no GA4 e como `portal` no produto (é o único estado com ação na tela). Inventar um quarto valor criaria dimensão fora do dicionário |
| 5 | **A H-02 diz que o link do casal "vale 30 minutos e uma vez só", e não diz o que acontece com uma sessão existente quando outro link é consumido** | Cada consumo cria uma **linha nova** de acesso, em vez de rotacionar o token. São duas pessoas com dois celulares: rotacionar derrubaria a sessão da noiva quando o noivo pedisse um link |
| 6 | **O PRD não diz como o `dono` é marcado** | O bootstrap marca (`--dono`), e o consumo de convite **herda** do evento. No casamento cobaia o dono é o casal (PRD §5.2); no evento de teste, ninguém é dono |

### E um achado no código da Fatia 0

`test/pagina-com-dados-do-seed.test.tsx` **passou no dia em que foi escrito e
falhou no dia seguinte, sozinho**: o `agoraMs` da primeira pintura estava pinado,
mas a contagem regressiva é componente de cliente e recalcula com `Date.now()`
depois de montar — o teste conferia o relógio da máquina. Congelei o relógio com
`vi.setSystemTime` (só `Date`, para a Testing Library continuar funcionando). O
defeito era do teste, não da página.

---

## As três condições do `lead-design`, registradas para a F1.3

Elas valem quando o `CardMidia` nascer (H-08/H-10), e não têm efeito nesta
entrega:

1. **A assimetria de largura entre os dois selos claros é SINAL, não desalinho.**
   Não "simetrizar" numa passada de ajuste visual.
2. **O `aria-label` do card é o único portador escrito do estado na grade** —
   logo é carga estrutural, não cortesia. No tile mínimo de 104 px o selo de
   destino usa só o ícone, e o rótulo vive ali.
3. **O tracejado é decorativo** e pode sumir numa limpeza de CSS sem derrubar
   nada.

E a que **já foi aplicada** nesta entrega: `PalcoTelao` entra na lista de
delegação de `trataLargura` em `scripts/ds-medidas.mjs`, com o motivo escrito no
código — a superfície de projeção **é** a largura, e espalhar `maxWidth` num
telão é o erro que a catraca induziria.

---

## O que o `pnpm verificar` cobre, e o que ele não cobre

**Cobre:** tipos, lint (cor literal, `components/ui`), 298 testes — fila local
contra rede degradada, ordem intenção→bytes, janela em dois fusos, matriz de
autorização, vazamento entre inquilinos, máscara de PII, assinatura do R2,
saneamento do registro de erro —, a catraca de design system e o contrato da API.

**Não cobre, e é honesto dizer:** layout. Uma tela que renderiza inteira torta
passa em verde. Também não cobre o comportamento em aparelho real (a lista do
ensaio, acima) nem a viagem pela rede até o Postgres — não há credencial de banco
neste ambiente, e os testes usam bancos falsos que imitam os tipos que o driver
devolve.
