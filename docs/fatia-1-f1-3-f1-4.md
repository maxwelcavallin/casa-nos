# Fatia 1 · F1.3 e F1.4 — a pessoa, a escolha dela, e a prova pública

**Data:** 19/08/2026 · **Autor:** dev-fullstack
**Histórias:** H-03, H-09, H-10, H-08 (F1.3) · H-11, H-04, H-12 (F1.4)

Como em `docs/fatia-0.md` e em `docs/fatia-1-f1-1-f1-2.md`: **cada ausência aqui
é uma decisão, com motivo, e com o lugar onde ela volta.** Ausência escrita é
decisão; ausência não escrita é esquecimento.

---

## O que entrou

### F1.3 — a pessoa, e a escolha dela

- **H-03** `/painel/[eventoId]/convidados` e `lib/convidados.ts`. A caixa de
  colar, com a vírgula lida da **direita** ("Silva, João, 2" é um slot chamado
  "Silva, João"), as linhas recusadas voltando inteiras com o motivo, e a
  reimportação que compara por nome exato. As duas grandezas — **slots** e
  **pessoas** — viajam separadas do banco até a tela, e nunca são somadas.
- **H-09** `SeletorNomeConvidado` e `PATCH .../participacoes/atual`. A pergunta
  abre em "as minhas fotos", **com o envio já correndo**, e fechar não cancela
  nada. A busca é local, sem acento e sem caixa (decisão P7) — a lista é servida
  inteira pelo servidor, então a identificação funciona offline.
- **H-10** `FolhaDeEnvio` (os dois botões **são** a escolha) e
  `PATCH .../midias/[midiaId]/visibilidade`. `midias.visibilidade` tem **um**
  caminho de escrita no produto inteiro, e um teste varre `lib/` e `app/` para
  garantir que continue sendo um.
- **H-08** `/e/[slug]/album/minhas`. As duas perguntas em campos separados no
  contrato da API, os três valores de chegada, o slot do topo com as quatro
  prioridades, e o `Tudo aqui` que se recolhe sozinho.

### F1.4 — a prova pública

- **H-11** `GET /api/eventos/[id]/feed` com cursor e agrupamento de lote **no
  banco**, `GET .../feed/novidades` como sondagem barata, e a grade no álbum.
- **H-04** `/painel/[eventoId]/materiais`, `GET /api/eventos/[id]/qr`, e um
  **codificador de QR próprio** (`lib/qr.ts`).
- **H-12** `/telao/[token]`, `PalcoTelao`, `temaTelao`, e o silêncio.

### As catracas novas

| Catraca | Onde | Estado |
|---|---|---|
| `carregando: false` fora de `finally` — **a forma nova**, de objeto de estado | `scripts/ds-medidas.mjs` | **0** |
| Um único `update midias set visibilidade` no produto | `test/minhas-e-visibilidade.test.ts` | 1 arquivo — proibição |
| Nenhuma palavra terminal no eixo de chegada | idem | 0 |
| Os dois tetos de caracteres (110 agregada, 60 por item) | idem | passa |
| `/minhas` não devolve `aprovacao`, em campo nenhum | idem | proibição |
| O feed não devolve campo de estado nenhum | `test/feed.test.ts` | proibição |
| Os quatro filtros do feed, e o telão com o **mesmo** recorte | idem | proibição |
| As nove proibições da parede, varridas no código do telão | `test/telao.test.ts` | 0 |
| Só cinco variantes tipográficas no telão | idem | proibição |
| `vw` e nunca `cqw` nos três arquivos de projeção | idem | 0 |
| `days_since_event` e a data da janela em `TZ=UTC` **e** `TZ=America/Sao_Paulo` | `test/medida-do-dia*.test.ts` | 0 |
| O codificador de QR contra os valores publicados da especificação | `test/qr.test.ts` | passa |

---

## Zero migrations novas, e é a única resposta certa

`convidados` (0004), `participacoes` (0005) e `midias` (0006) já têm **todas** as
colunas que estas sete histórias usam — `ausente`, `convidado_id`, `rotulo`,
`modo_identificacao`, `visibilidade`, `visibilidade_alterada`, `excluida_em`,
`excluida_por` —, e o índice parcial do feed (`midias_feed_idx`) cobre
exatamente a cláusula da consulta mais quente do produto.

Foi assim de propósito: a F1.1 criou `convidados` sem a tela dela justamente para
`participacoes` poder nascer com a chave estrangeira. **O schema estava certo
antes de a tela existir**, e isso é o que uma migration versionada compra.

`0008` e `0009` continuam reservadas (views de medição e `leads`), pelo mesmo
motivo da fatia anterior: o número é combinado entre documentos.

---

## O QR: por que ele foi escrito aqui

`lib/qr.ts` é um codificador completo — modo byte, correção **M**, versões 1 a
10, Reed-Solomon em GF(256), oito máscaras com penalidade, campo de formato e
campo de versão.

**O motivo não é evitar dependência; é poder verificar.** O QR é o passo 1 do
funil inteiro: se ele não ler, não existe foto, não existe feed e não existe
telão — e o defeito só aparece na mesa, no sábado, com 150 pessoas. Um pacote de
terceiro resolveria a geração e não deixaria **nada** para este ambiente
verificar antes da festa.

O que `test/qr.test.ts` prova, e o que ele não prova:

**Prova** — a correção de erro de "HELLO WORLD" bate com o vetor publicado; o
campo de formato bate com a tabela nas oito máscaras; o campo de versão bate nas
versões 7 a 10; e **o caminho de volta**: a matriz é lida de novo, a máscara é
desfeita, e o que sai é exatamente o que entrou, em oito tamanhos de entrada.
Isso exercita o ziguezague, a coluna de temporização pulada, as posições
reservadas e a intercalação de blocos.

**Não prova** — que a câmera de um iPhone lê o papel impresso sob luz baixa. Isso
é critério de aceite da H-04 e é registro humano no PR, com um cartão impresso.

Dois defeitos que o caminho de volta pegou enquanto isto era escrito, e que
nenhum teste de renderização acusaria:

1. **A coluna 6 visitada duas vezes.** "Quando a coluna for 6, use a 5" faz o par
   (5,4) e depois o par (4,3) — a coluna 4 recebe dois bits diferentes e o código
   sai ilegível, **sem nada estourar**.
2. **O campo de formato dividido 8/7 em vez de 7/8**, sobrescrevendo o módulo
   escuro obrigatório. Alguns leitores aceitam o resultado e outros recusam — que
   é o pior defeito possível, porque passa no teste de quem gerou.

---

## O telão: como alguém descobre que ele congelou

Esta é a pergunta que o `designer` deixou, e ela merece a resposta inteira.

**A parede não pode contar.** Erro projetado num casamento é incidente, não
estado: perdeu a rede, perdeu o servidor, o link foi revogado — a tela continua
rodando o buffer que já tem, em silêncio. O `catch` da sondagem é **vazio de
propósito**, com o motivo escrito dentro dele. Se o buffer esvaziar, a tela volta
para a arte do vazio, que é uma chamada, nunca para uma tela de erro.

A consequência é dura e está escrita: **telão parado e telão rodando são
visualmente idênticos da pista de dança.**

**Então a evidência mora no banco.** Cada sondagem bem-sucedida carimba
`evento_acessos.ultimo_uso_em` (no máximo uma vez por minuto — sem o limite,
seriam 4.320 escritas numa linha só durante a festa). A distância entre esse
carimbo e agora é a resposta para *"o telão ainda está falando com a gente?"*.

**O que isso significa hoje, e é honesto dizer:** o dado existe e **a tela que o
lê não existe ainda**. Ela é o painel do dia ao vivo (H-19), da F1.6. Até lá, a
consulta é uma linha de SQL. Escrevi o carimbo agora, e não junto com a tela,
porque um telão que rodou seis horas sem carimbar nada deixa a F1.6 sem passado
para ler — e a festa não se repete.

**As duas outras coisas que o telão faz sozinho:**

- **Recarrega quando a versão muda, e só com a tela vazia.** `VERSAO_DO_APP` sai
  do `VERCEL_DEPLOYMENT_ID` no servidor e viaja na resposta; o cliente compara
  com a que carregou. Com o buffer vazio a tela está parada na arte do vazio, e a
  recarga é invisível — no meio de uma foto ela seria um piscar de três metros.
- **Não cresce.** O buffer tem teto de 60 itens e há sempre **uma** imagem no
  DOM. A memória é constante desde a primeira hora, e é isso que sustenta as seis
  horas sem recarregar.

---

## O que foi provado sobre o feed com muitos itens, e com quantos

**Provado no CI, com banco falso** (`test/feed.test.ts`):

- os quatro filtros estão na cláusula, literalmente — e o do telão é o **mesmo**,
  conferido pedaço a pedaço, para que uma foto tirada do feed suma da parede sem
  ninguém lembrar de mudar dois lugares;
- a ordem é `armazenada_em desc, id desc`, e `capturada_em` **não aparece** na
  consulta;
- o agrupamento de rajada acontece no banco (`distinct on (lote_id)`), e a
  contagem é a do **lote inteiro** — não a fração que caiu na página;
- a paginação por cursor: com 41 linhas devolvidas para uma página de 40, o
  cursor existe; com 1, ele é `null`. Cursor torto vira `null` em vez de estourar;
- toda consulta carrega o `evento_id` e nenhuma carrega o do vizinho.

**Provado no navegador de teste** (`jsdom`): a grade monta com 3 itens e sem
nenhum selo, em eixo nenhum.

**NÃO provado, e é o que falta:** o número. **Nenhum teste deste commit rodou
contra 6.000 itens reais**, e por dois motivos que valem escritos:

1. **Não há credencial de banco neste ambiente.** Os testes usam bancos falsos
   que imitam os tipos que o driver devolve. Uma consulta que o índice parcial
   não cobrisse passaria aqui em verde e varreria a tabela em produção.
2. **O teto da H-11 é de tempo em aparelho** — "menos de 3 s num Android de 3
   anos em 4G" —, e isso não se mede em `jsdom`.

O que existe hoje é o **desenho** que torna o número alcançável: índice parcial
cobrindo a cláusula, agrupamento no banco, cursor em vez de `offset`, miniatura
de 400 px na grade e prévia só ao abrir. **A medição é a H-21 (F1.7)**, e ela é
critério de término da fatia — não deste commit.

**A virtualização acima de 200 itens ficou de fora**, e é a maior dívida desta
sub-fatia: hoje a grade renderiza tudo o que já buscou. Com paginação de 40 e
rolagem manual, o pior caso realista de uma noite são algumas centenas de nós, e
o `CardMidia` tem contrato visual fixo (tile e vão constantes) justamente para a
virtualização caber depois sem mudar nada. **Se o teste de carga mostrar que
6.000 itens travam a rolagem, é ali que ela entra.**

---

## O que faltou nos documentos

| # | O buraco | O que eu fiz |
|---|---|---|
| 1 | **Ninguém disse como a mídia é LIDA.** O PRD fixa o layout das chaves e a assinatura de `PUT`; a F1.4 é a primeira que precisa de `GET`, e o teto de "6.000 itens em 3 s" torna uma rota assinada por miniatura inviável | **ADR 0005**, com a postura declarada: base pública, chave com dois uuid, e **quem tiver a URL exata de uma foto `noivos` a vê sem sessão**. Precisa de confirmação do `po`, e a alternativa desenhada (miniatura pública, prévia assinada) está no ADR |
| 2 | **O `gtm.md` imprime o endereço curto como `casa-nos.app/ana-e-max`, e o PRD §6.1 não declara nenhuma rota `/<slug>`** — o álbum mora em `/e/<slug>/album` | Implementei o endereço **verdadeiro** (`casa-nos.app/e/ana-e-max/album`). Escrever o do mock daria um cartão de mesa com um endereço que responde 404, que é pior que um endereço comprido. **Encurtá-lo é uma rota nova e uma decisão do `po`** |
| 3 | **A H-02 pede revogar o link do telão; ninguém diz onde ele é CRIADO** — ficou registrado como buraco na F1.1 | Fechado na tela de materiais, que é onde o QR e os links vivem juntos. **Sem isso a H-12 não tem porta**: o telão abre por link próprio, e se ninguém gera o link, a tela mais visível do produto é inalcançável. O texto do diálogo é o do `gtm.md` §5.10 |
| 4 | **O `metricas.md` §7.1 lista `error_kind` com QUATRO valores** (`rede`, `portal`, `servidor`, `arquivo`); a F1.2 registrou que o dicionário tinha três e mandou o portal viajar como `rede` | Nada mudou no código — a decisão da F1.2 continua valendo e é a mais conservadora. Mas **as duas seções do mesmo documento discordam**, e a §7.1 é a que vira dimensão registrada. É um item para o `product-analytics`, junto com o `ambos` |
| 5 | **`media_visibility: ambos` continua no `metricas.md` §6** | Vale o PRD (§3.1, V1): a união de tipos tem dois valores e `ambos` não compila. A pendência é do `product-analytics` e continua aberta |
| 6 | **O `gtm.md` §5.8 dá `h2` para "APONTE A CÂMERA" e `body2` para o endereço**; `body2` **não existe** no tema do telão (§14.4), e o design system pede `h3` e `subtitle1` | Segui o design system e as telas aprovadas, que já tinham resolvido a divergência do mesmo jeito e a declararam. Registrado para o `pmm` não "corrigir" de volta |

---

## O que ficou de fora, e por quê

| Fora | Por quê | Onde volta |
|---|---|---|
| **O CTA do loop** abaixo da grade de "as minhas fotos" | É a H-16, e ela depende de `leads` (migration 0009). O espaço está marcado no código, com o divisor, e **vazio de propósito** | F1.7 |
| **`cta_surface = feed`** | O `po` arbitrou (R8): a linha de aquisição **não entra no feed**, em forma nenhuma. Não emitido, não desenhado, não previsto | Fatia 2, **se** o ensaio der verde e o alcance do CTA ficar abaixo de 70% |
| **Baixar a foto** (H-20) e o **link guardado** (H-22) | `Should`, com data-limite no casamento e não no ensaio. A folha da foto oferece "Mudar quem vê" e "Apagar"; o botão de baixar entra ali | F1.7 |
| **O `Desfazer` de verdade** do toast de exclusão | A exclusão já é lógica com 30 dias de carência (o dado dá para voltar), mas a **rota** de restauração é da F1.5, junto com o painel de mídias. O toast hoje diz o limite honesto, que é a parte que não podia faltar | F1.5 |
| **Virtualização da grade** | Ver acima: o contrato visual já a permite, e o número que a justifica é da H-21 | F1.7, se o teste de carga pedir |
| **Fila de aprovação, painel de mídias, reconciliação, teste de carga** | H-13, H-14, H-15, H-21 | F1.5 a F1.7 |
| **A rota de renomear pelo casal** (`PATCH .../participacoes/[id]/rotulo`) | H-23, `Could`. A rota `atual` existe e é do próprio convidado — ela usa `atual` no caminho **justamente** para não ter um id de cliente a conferir | F1.7 |

---

## As três condições do `lead-design`, cumpridas

1. **A assimetria de largura entre os dois selos claros é sinal.** `Chegando`
   renderiza com rótulo escrito; `Ainda subindo`, só com o glifo — e a prop
   chama-se `comRotulo`, com o motivo escrito por cima dela e a frase *"não é
   descuido; é a especificação"*. Quem "simetrizar" numa passada de ajuste visual
   está removendo acessibilidade, não desalinho.
2. **O `aria-label` do card é carga estrutural.** `rotuloAcessivel()` tem
   comentário próprio dizendo que ele é o **único portador escrito** de
   `Ainda subindo` na grade, e que editá-lo é mexer em acessibilidade.
   `test/telas-f1-3-f1-4.smoke.test.tsx` afirma os três rótulos, inclusive o do
   estado terminal — onde não há selo visível nenhum.
3. **O tracejado é decorativo.** Está escrito no `SeloEstado`: se sumir numa
   limpeza de CSS, os três sinais fortes (largura, glifo e barra) continuam de
   pé. Nenhum teste depende dele.

---

## Uma mudança na F1.2 que a F1.3 obrigou

`lib/fila/motor.ts` ganhou uma **trava de drenagem por evento**, de módulo, no
lugar do booleano por motor.

Até a F1.2 existia uma tela só. A F1.3 acrescenta a segunda: tocar num dos dois
botões leva a "as minhas fotos", e a navegação **monta um segundo motor sobre o
mesmo IndexedDB** enquanto a drenagem da tela anterior ainda corre. Nada se perde
sem a trava — a confirmação é idempotente e a chave no R2 é a mesma —, mas o
mesmo arquivo subiria duas vezes no uplink do salão, que é o recurso escasso da
noite.

---

## Duas exceções de lint, escritas

`react-hooks/set-state-in-effect` recusa **qualquer** função assíncrona que chame
`setState` e seja chamada de dentro de um efeito — mesmo quando o primeiro
`setState` só acontece depois de um `await`, que é o caso de todo carregamento de
dado na montagem. Confirmei com um arquivo de teste isolado: a regra dispara nas
duas formas (com e sem `try/finally`).

Onde a regra apontava desvio **real**, o código mudou: `IndicadorEnvio` e
`FolhaDaFoto` zeravam estado dentro do efeito, e agora zeram por **remontagem**
(`key`), o que é mais barato e ainda conserta um defeito — o segundo "Tudo aqui"
da noite voltou a aparecer.

Onde ela reprovava o certo, ficou uma exceção **de uma linha**, com o motivo
escrito e apontando para o que continua guardando a regra de verdade: a catraca
`desligamento de carregando fora de finally`, que mede a forma nova de estado e
está em zero.

---

## Como o `pnpm verificar` mudou

**433 testes** (eram 298). O que entrou:

- o codificador de QR contra os valores publicados da especificação, e o caminho
  de volta em oito tamanhos;
- a caixa de colar da lista, com a vírgula da direita, as linhas recusadas e a
  reimportação;
- o contrato de `/minhas` (dois campos, sem `aprovacao`) e o do feed (sem campo
  de estado nenhum);
- a varredura que prova **um** caminho de escrita para `midias.visibilidade`;
- a copy dos dois eixos: palavra terminal, os dois tetos e a proibição de
  interpolar dado de tamanho variável em linha com teto;
- o telão: cinco variantes, cores de estado desligadas, `vw` e não `cqw`, o chão
  pintado pelo palco, e as nove proibições varridas no código;
- `days_since_event` e a data da janela nos **dois** fusos;
- as quatro telas novas montadas, com o texto exato do `gtm.md`.

**O que ele continua não cobrindo, e é honesto repetir:** layout. Uma tela que
renderiza inteira torta passa em verde — e **no telão isso é literalmente
invisível**, porque não há a quem perguntar. Também não cobre aparelho real, nem
projetor, nem câmera lendo papel impresso. Essas três estão na lista do ensaio.
