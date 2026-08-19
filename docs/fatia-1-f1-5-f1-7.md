# Fatia 1 · F1.5 a F1.7 — o controle, a verdade e o loop

**Data:** 19/08/2026 · **Autor:** dev-fullstack
**Histórias:** H-13, H-14 (F1.5) · H-15, H-17, H-19 (F1.6) · H-16, H-21, H-20,
H-22, H-23 (F1.7)

Como em `docs/fatia-0.md`, `docs/fatia-1-f1-1-f1-2.md` e
`docs/fatia-1-f1-3-f1-4.md`: **cada ausência aqui é uma decisão, com motivo, e
com o lugar onde ela volta.** Ausência escrita é decisão; ausência não escrita é
esquecimento.

**A Fatia 1 fecha aqui.**

---

## 0. A correção que veio antes de tudo: a foto `noivos` não vaza

A F1.4 entregou o ADR 0005 declarando que *"quem tiver a URL exata de uma foto
`noivos` a vê sem sessão"*. **Isso foi rejeitado no mesmo dia**, e com razão: o
produto imprime **"Só os noivos veem esta foto"** na tela da convidada, e a razão
entre os dois botões é a hipótese central que a Fatia 1 existe para medir.

O `po` transformou a correção em **RN-33**, e ela é schema, não regra:

```
pub/e/<evento_id>/m/<midia_id>/{t,p}.jpg    derivadas de mídia `feed`
prv/e/<evento_id>/m/<midia_id>/{t,p}.jpg    derivadas de mídia `noivos`
prv/e/<evento_id>/m/<midia_id>/o.<ext>      ORIGINAL — sempre
```

`pub/` é servido por um domínio público. **`prv/` não é servido por ninguém sem
assinatura de 15 minutos.** A decisão inteira, com a coreografia da troca de
visibilidade e o que ela custa, está em
[`docs/adr/0005-dois-prefixos-no-balde.md`](adr/0005-dois-prefixos-no-balde.md).
A redação anterior virou lápide, e a lápide fica — porque ela contém a aritmética
da metade que sobreviveu.

### Como isto foi provado

**Quatro provas, e a segunda é a que importa.**

1. **A URL de `noivos` nunca contém o domínio público** — nem como prefixo, nem
   como parâmetro —, mesmo com ele configurado. E **sem credencial de R2 ela é
   `null`**, e não a pública: uma implementação que caísse para a base pública ali
   reabriria o buraco inteiro no primeiro ambiente mal configurado.
   (`test/r2-assinatura.test.ts`)

2. **A troca falha inteira quando a borda continua respondendo.** Este é o buraco
   que apareceria meses depois como "bug de cache": o objeto some da origem, a
   purga não roda (token não configurado), e a CDN continua servindo a foto por
   horas. Conferindo só a origem, isso passaria em verde.
   (`test/visibilidade-move-objetos.test.ts`)

3. **A ordem dos quatro passos** — copiar, apagar, purgar, conferir —, com o
   índice de cada um, e a coluna **não mudando** quando qualquer um falha.

4. **A varredura do cron** apaga o objeto público de mídia `noivos`, de mídia
   excluída e de mídia **sem linha no banco** — e não apaga o da mídia `feed`
   legítima.

### O que isto NÃO prova, e está declarado

- Que o domínio público está configurado **apenas** no prefixo `pub/`. Se ele
  servir a raiz do balde, `prv/` fica público e a decisão é anulada por
  configuração, sem uma linha de código mudar. Está escrito no `.env.example`,
  em maiúsculas, porque é o único jeito de essa linha ser lida.
- Que a purga da Cloudflare funciona com o token daquele ambiente. **Tem plano
  B embutido:** a conferência do passo 4 reprova a troca se a borda não limpar.

---

## 1. O que entrou

### F1.5 — o casal no controle

- **H-13** `/painel/[eventoId]/fila`, `lib/moderacao.ts`,
  `GET|POST /api/eventos/[id]/midias/moderacao`. "Aprovar as 400" é **um toque e
  uma instrução SQL**. A fila filtra `visibilidade = 'feed'`: uma foto `noivos`
  pendente nunca chega ao feed nem à parede, e listá-la faria o casal trabalhar à
  toa. Recusar escreve `aprovacao = 'recusada'` e **não apaga**.
- **H-14** `/painel/[eventoId]/midias`, `lib/painel-midias.ts`,
  `GET .../resumo` e `GET .../midias`. Dois números em campos separados, nunca
  somados. Erro **no lugar do número**, com travessão. `aprovacao` **não filtra
  nada** aqui — e essa ausência tem teste, porque ausência de cláusula é o que
  alguém acrescenta sem perceber.

### F1.6 — a verdade

- **H-15** `lib/reconciliacao.ts`, `POST /api/interno/reconciliacao` (cron) e
  `POST .../participacoes/atual/reconciliar`. Migration `0008` com as quatro
  views. A adoção carimba **a data do objeto**, não `now()`.
- **H-17** `error_kind` com quatro valores (migration `0011`), os cinco eventos
  que faltavam, e a catraca que recusa texto livre em parâmetro do dicionário.
- **H-19** `/painel/[eventoId]/dia-ao-vivo`, `lib/medicao.ts`,
  `GET .../medicao`. Sete números, **cada um respondendo sozinho**.

### F1.7 — o loop e o ensaio

- **H-16** `lib/leads.ts`, migration `0009`, `POST .../leads`, `FolhaDoCta`,
  `RodapeDoLoop`. `evento_id_origem` **vem da URL, nunca do corpo**.
- **H-21** `pnpm carga` — 200 clientes contra o produto compilado. Relatório em
  [`docs/carga-fatia-1.md`](carga-fatia-1.md).
- **H-20** `GET .../midias/[midiaId]/download` — assinada, 15 min, e o botão diz
  qual versão está baixando.
- **H-22** `POST .../participacoes/atual/recuperacao`, `POST /api/sessao/retomar`,
  `/r/[token]`.
- **H-23** `PATCH .../participacoes/[participacaoId]/rotulo`, e o aviso que **só
  existe depois da festa**.

### E a rota curta

`casa-nos.app/<slug>` → **307** para `/e/<slug>/album`, preservando o `?o=`. O
achado da F1.4 (o `gtm.md` imprimia um endereço que não existia) fechou pelo
caminho certo: **tirar o 404 do caminho**, e não escolher entre dois defeitos.

O risco de verdade dela não é a rota: **é a próxima pasta criada em `app/`**. No
dia em que alguém criar `app/precos/`, o casamento com slug `precos` deixa de
existir — em silêncio, e depois de 40 cartões de mesa já impressos.
`test/rota-curta.test.ts` lê o disco e falha se `app/` tiver uma pasta de
primeiro nível que não esteja em `SEGMENTOS_RESERVADOS`.

---

## 2. As migrations

| # | O que | Por que agora |
|---|---|---|
| `0008` | As quatro views de medição | A H-15 antes da H-19: os sete números **são** as views. Sem elas, o painel vira `SELECT` digitado à mão na noite do casamento, que é o que `metricas.md` §1.4 proíbe com todas as letras |
| `0009` | `leads` | O loop não fecha por cookie. Sem `evento_id_origem` persistido, o número que decide se este negócio tem canal de aquisição sai **zero por construção** |
| `0011` | `error_kind` ganha `portal` | `rede` é a internet que caiu — não faça nada. `portal` é a internet que **mentiu**, o único erro que produz perda silenciosa. Colapsados, o painel recomendaria "não faça nada" no único caso em que agir é obrigatório |

`leads` ganhou **uma coisa que o PRD §5.8 não pedia**: índice único em
`(evento_id_origem, contato)` entre os vivos. Não é higiene — a folha do CTA
reenvia sozinha quando a rede volta, e sem a chave "9 pessoas deixaram contato"
viraria 14 por retentativa. O número que mede o loop passaria a medir a rede do
salão.

---

## 3. As catracas novas

| Catraca | Onde | Estado |
|---|---|---|
| A troca para `noivos` **falha** se a borda ainda responder | `test/visibilidade-move-objetos.test.ts` | proibição |
| A URL de `noivos` nunca é a pública, e sem R2 é `null` | `test/r2-assinatura.test.ts` | proibição |
| **Toda pasta de primeiro nível de `app/` está reservada** | `test/rota-curta.test.ts` | 0 órfãs |
| A lista de reservados não guarda pasta que já não existe | idem | 0 |
| O álbum do convidado não passa `aprovacao=` e não fala de aprovação | `test/moderacao.test.ts` | 0 (uma exceção nominal: `CardMidia`, compartilhado, com motivo) |
| O painel **não** filtra por aprovação sem o casal pedir | idem | 1 ocorrência, atrás do filtro do usuário |
| A união tem exatamente os 16 eventos da fatia | `test/analytics-dicionario.test.ts` | proibição |
| **Nenhum parâmetro do dicionário aceita texto livre** | idem | 2 exceções, com motivo escrito |
| Nenhum campo do dicionário se chama como PII | idem | 0 |
| A origem do lead vem da URL, nunca do corpo | `test/leads.test.ts` | proibição |
| O WhatsApp não sai para o GA4 | idem | proibição |
| `cta_surface = feed` não é emitido | idem | 0 |
| O agregado do casal bate com `count(*)` — **banco real** | `test/contadores-vs-verdade.test.ts` | divergência 0 |
| A consulta de perda diz 0 hoje e **3 depois de D+7** | `test/perda-vs-verdade.test.ts` | proibição |
| As sete linhas nos dois fusos | `test/medicao*.test.ts` | proibição |
| `carregando` fora de `finally` | `scripts/ds-medidas.mjs` | **0** |
| Todas as medidas do design system | idem | **0** |

**Duas catracas foram consertadas, e não afrouxadas.** A varredura de
`update midias set visibilidade` acusava `lib/moderacao.ts` — falso positivo: lá
`visibilidade` está na cláusula `where`, não no `set`. Falso positivo numa catraca
é como ela é desligada: alguém acrescenta uma exceção nominal, e a seguinte entra
sem ninguém olhar. Agora a varredura olha **só o que está entre `set` e `where`**.
E o extrator do contrato OpenAPI não encontrava rota com comentário no meio da
declaração — a rota sumia do JSON **em silêncio**. `test/openapi.test.ts` pegou.

---

## 4. O teste de carga: o que ele disse

O relatório inteiro está em [`docs/carga-fatia-1.md`](carga-fatia-1.md). O
resumo:

**O que quebrou primeiro: a conexão com o banco, na rota de intenção.** 1.040 de
4.000 tentativas, com `NeonDbError: Error connecting to database`. Nada mais
quebrou — QR, identificação, confirmação, paginação do feed e as sete linhas
atravessaram o pico com zero erro.

**E não significa que a festa vai quebrar.** O teste roda no Brasil contra um
banco em `us-east-1` (~150 ms por consulta, contra 1–5 ms em produção) e comprime
6 horas em 180 segundos — **120× a taxa real**. Descomprimido, o pico real são
~1 req/s na intenção. A margem é de duas ordens de grandeza.

**O achado que fica:** a intenção custa **seis idas ao banco em série**, e é a
primeira a ceder. Ela também é a rota cuja falha o produto sabe absorver — a fila
retenta, e a reconciliação adota o que subiu sem confirmar. É o lugar certo para
quebrar. O gatilho para mexer nela (p90 acima de 1,5 s no ensaio) está escrito no
relatório.

**A virtualização fica para a Fatia 2**, e o veredito é medido: abrir o álbum
monta **427 nós** (40 cartões, 17 KB); os 63.645 nós de 6.000 fotos só existem
para quem rolar 150 páginas sem recarregar. O limite escrito: **acima de ~1.000
itens na mesma sessão de rolagem** (10.600 nós) a grade entra na faixa em que um
aparelho antigo engasga, e é esse o gatilho para trazê-la antes do casamento.

---

## 5. O que faltou nos documentos

| # | O buraco | O que eu fiz |
|---|---|---|
| 1 | **O `gtm.md` §5.13 dá o botão (`Tirar do álbum`) e o toast, e não dá o SELO do estado resultante.** O painel de mídias tem três eixos, e `recusada` precisa de rótulo | Escrevi **`Fora do álbum`** — a forma mais curta com as palavras do próprio botão. Nunca "recusada" nem "rejeitada": as duas sugerem que a foto saiu do painel do casal, e ela não saiu. **É texto inventado, e precisa do `pmm`** |
| 2 | **`metricas.md` §11 pede a linha 7 como "viram · clicaram · leads com data", e "clicaram" não existe no Postgres** | O clique abre uma folha local, sem ida ao servidor — de propósito: uma requisição a mais no salão é uma chance a mais de falhar. A linha mostra **"N viram · N deixaram contato · N com data"**, onde "viram" é *participações com ao menos uma mídia armazenada* — a condição exata em que o CTA é desenhado, e um denominador melhor que o do GA4, que perde toda sessão offline. **Divergência declarada com o `gtm.md` §5.15** |
| 3 | **A H-15 pede "gera prévia no servidor para mídia com original presente e prévia ausente" (P12)** | **Não implementado, e a ausência é declarada.** Exige um decodificador de imagem no servidor — HEIC inclusive —, que é uma dependência nova e uma decisão de arquitetura, não algo para entrar de lado dentro de um cron. O que existe é a **marca**: `previa_pendente_servidor = true`, que aparece como qualidade degradada e não some. Sem ela, esse caso viraria "perda" no número da H-15, que é a leitura errada — os bytes estão no balde |
| 4 | **A H-16 pede que "o link do CTA carregue `?de=<wedding_id>`"** | A outra metade **não existe nesta fatia**: o parâmetro pressupõe um destino — a página de cadastro do casal —, e ela é da Fatia 2 (V8). O CTA aqui não navega, abre uma folha. `enderecoComOrigem` está escrita e testada para a Fatia 2 não redescobrir o nome do parâmetro. O `localStorage` (a ponta que existe) foi implementado |
| 5 | **A H-18 pede alerta para "o cron diário não rodou"** | **Não existe, e não pode existir do jeito pedido:** um processo não consegue avisar que não rodou. O que existe é evidência onde uma pessoa olha — `evento_contadores.recomputado_em` viaja no painel do dia ao vivo. Um vigia de verdade é um serviço externo batendo numa rota, e é configuração. Está no README |
| 6 | **O PRD §6.1 lista `GET /r/[token]` como tela e não lista quem troca o token por cookie** | Criei `POST /api/sessao/retomar`. Componente de servidor não grava cookie no Next, e um `GET` que consumisse o link seria disparado pela **pré-visualização do WhatsApp** — que é justamente para onde este link é feito para ir. É o mesmo defeito que a H-02 já enfrentou com o link do casal |
| 7 | **A Vercel chama cron por `GET` com `Authorization: Bearer`; o PRD declara `POST` com cabeçalho próprio** | A rota aceita as duas formas, com o mesmo segredo e o mesmo trabalho. Uma rota que só aceitasse a do PRD responderia 401 todo dia às 12h, e ninguém perceberia — ninguém olha o log de um cron que "está configurado" |
| 8 | **`media_picker_opened` pede `media_source` (`camera` \| `galeria`)** | Sai sempre `galeria`. O campo abre o seletor do sistema (não há `capture`), e o produto **não sabe** qual das duas a pessoa vai usar antes de o arquivo chegar. Declarar `camera` seria inventar; a origem de verdade viaja depois, no `media_upload_succeeded` |
| 9 | **O PRD §5.8 não previa unicidade em `leads`** | Índice único em `(evento_id_origem, contato)`. Ver §2 |

---

## 6. O que ficou de fora, e por quê

| Fora | Por quê | Onde volta |
|---|---|---|
| **Virtualização da grade** | Medido: abrir monta 427 nós. O gatilho para trazê-la está no relatório de carga | Fatia 2, ou antes do casamento se o ensaio mostrar sessão acima de 1.000 itens |
| **Geração de prévia no servidor** (P12) | Dependência nova (decodificador de imagem, HEIC). A marca existe e o caso não vira "perda" | Decisão de arquitetura com o `pm-lead` |
| **O `Desfazer` de verdade** do toast de exclusão | A exclusão já é lógica com 30 dias de carência — o dado volta. Falta a **rota** de restauração, que ninguém especificou | Fatia 2, ou uma linha no PRD |
| **`cta_surface = feed` e `telao`** | Arbitrado (R8): a linha de aquisição não entra no feed em forma nenhuma. No telão entra marca, não pergunta | Fatia 2, **se** o ensaio der verde e o alcance do CTA ficar abaixo de 70% |
| **Paginação da grade do painel e da fila** | O cursor existe e é devolvido nas duas rotas; a tela ainda não tem o "carregar mais". Com 400 pendentes a primeira página resolve o toque principal ("Aprovar as 400" não precisa da lista) | Junto com a virtualização |
| **`leads` lido pela API** | Ninguém lê `leads` pela API do produto na Fatia 1 (PRD §7). A leitura é consulta do dono | Fatia 2 |
| **Filtro "De um convidado"** na tela | A rota aceita (`?filtro=participacao&participacao=<id>`) e tem teste; a tela mostra os três primeiros. O quarto exige um seletor de 200 nomes, que é a tela de convidados de novo | Quando o casal pedir |
| **Exportação, álbum curado, download em lote** | `Won't` da Fatia 1 (V7) | Fatia 2 |

---

## 7. Duas coisas que consertei sem terem sido pedidas

**1. A foto tirada do álbum continuava na parede.** O telão só *acrescentava* ao
buffer: `?desde=` trazia as novas, e **nada saía**. Uma foto que o convidado tirou
do feed (H-10) ou que o casal tirou do álbum (H-13) continuava rodando por até 8
minutos — o tempo de o ciclo dar a volta nas 60 do buffer. A H-10 promete que a
foto some do feed **e do telão**, e a promessa valia pela metade.

Agora a sondagem pede a janela inteira e o buffer é **reconciliado**: o que a
resposta não trouxer, sai. O custo é uma resposta de até 60 linhas a cada 5 s
para **um** cliente — o computador do projetor. É o recurso mais barato que este
produto gasta.

Isso obrigou uma segunda mudança: **o ciclo anda por id, e não por índice.** Com
a janela chegando a cada 5 s, o buffer muda de deslocamento o tempo todo, e um
índice numérico passaria a apontar para outra foto a cada sondagem — a parede
trocaria de imagem no meio do intervalo de 8 s, visível para 150 pessoas.

**2. O `ultimo_uso_em` do telão ganhou leitor.** A F1.4 carimbou o dado sem ter
tela que o lesse, e escreveu que a tela viria na H-19. Ela veio — **no cabeçalho,
e não como oitavo número**: a H-19 diz sete, e sete é o teto. O sinal do telão é
o estado do **instrumento**, não o estado da festa, e mora ao lado de "Atualiza a
cada minuto".

---

## 8. Como o `pnpm verificar` mudou

**556 testes** (eram 433), em 43 arquivos. O que entrou:

- a coreografia da RN-33: a ordem dos passos, a recusa quando a borda responde, e
  a varredura de `pub/`;
- os dois prefixos do balde, por extenso, e a URL de `noivos` que nunca é pública;
- **a lista de reservados da raiz, varrida contra o disco de `app/`**;
- a fila (filtro, lote numa instrução, repetição inofensiva) e a ausência de
  aprovação no álbum do convidado;
- o painel sem filtro implícito de aprovação;
- a adoção com a data do objeto, idempotente, e o original sem prévia virando
  marca;
- o dicionário: 16 eventos, todos documentados, nenhum parâmetro com texto livre,
  nenhum campo com nome de PII;
- as sete linhas nos dois fusos, com `numeric` virando número na fronteira;
- as telas novas montadas, com o texto exato do `gtm.md`;
- **e duas contra o banco de verdade**: o agregado do casal contra `count(*)`, e
  a consulta de perda dizendo 0 hoje e 3 depois de D+7.

**O que ele continua não cobrindo, e é honesto repetir:** layout, usabilidade,
aparelho real, projetor, câmera lendo papel impresso. E agora, mais duas:

- **o balde.** Sem credencial de R2, a coreografia é provada contra uma porta com
  balde falso. Que o domínio público esteja configurado só no prefixo `pub/` é
  configuração, e é a única coisa capaz de anular a RN-33 sem mudar código.
- **escala.** `pnpm verificar` não sobe 200 clientes; quem faz isso é
  `pnpm carga`, e o resultado tem relatório próprio.

---

## 9. O que o `pm-lead` precisa decidir

1. **`Fora do álbum`** — texto inventado por mim para o selo de `recusada`. Do
   `pmm`.
2. **A linha 7 do painel do dia** diz "deixaram contato" onde o `gtm.md` §5.15
   diz "clicaram". Do `product-analytics` ou do `pmm`.
3. **A geração de prévia no servidor** (P12) — dependência nova, decisão de
   arquitetura.
4. **O vigia do cron** — serviço externo, configuração e custo.
5. **`R2_PUBLIC_BASE` no prefixo `pub/`** — é a linha de configuração capaz de
   anular a decisão de privacidade inteira. Ela precisa de conferência humana
   antes do ensaio, e ela está na lista do ensaio.
