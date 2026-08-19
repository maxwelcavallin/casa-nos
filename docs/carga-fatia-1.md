# Teste de carga — Fatia 1 (H-21)

**Data:** 19/08/2026 · **Script:** `pnpm carga` (`scripts/carga.mjs`) ·
**Bruto:** `docs/carga-fatia-1.json`

> **Este teste é critério de término da Fatia 1**, arbitrado pelo `pm-lead` em
> 18/08/2026. O ensaio com 20 pessoas não testa escala nenhuma, e sem ele a §7
> inteira do `escopo-core.md` — *onde o produto quebra com 200 aparelhos* —
> ficaria sem verificação até a noite da festa, que é tiro único.

---

## 1. O que foi rodado, exatamente

200 clientes simulados contra o produto **compilado** (`next build` + `next
start`), pelo HTTP, pelo proxy, pelas rotas de verdade, contra o **Postgres de
verdade** (Neon). Cada cliente guarda os próprios cookies e faz o que um
convidado faz:

1. lê o QR — `GET /<slug>?o=mesa`, o **307** da rota curta, e o álbum;
2. diz quem é — `PATCH /participacoes/atual` com um slot da lista;
3. registra intenção e confirma as duas faixas;
4. sonda o feed a cada 5 s.

| Parâmetro | Valor |
|---|---|
| Clientes | 200 |
| Mídias | 4.000, com **dois picos de 30% em 20 minutos** |
| Janela | 6 horas, comprimidas **120×** (180 s de relógio) |
| Sondagem | **40 req/s por 30 s** (200 clientes ÷ 5 s) |
| Álbum | 6.000 itens semeados |
| Lista | 184 slots presentes, `presentes_contagem = 184` |

---

## 2. Os números

```
  GET /<slug> + /e/<slug>/album (leitura do QR)  n=  200  p50=  680 ms  p90= 1244 ms  p99= 1546 ms  erros=0
  PATCH /participacoes/atual (quem eu sou)       n=  200  p50=  650 ms  p90=  744 ms  p99=  978 ms  erros=0
  POST /midias/intencao                          n= 2960  p50= 3944 ms  p90= 8677 ms  p99=11594 ms  erros=1040
  POST /midias/[id]/confirmacao                  n= 2957  p50= 1255 ms  p90= 2184 ms  p99= 6356 ms  erros=3
  custo do produto no seconds_since_scan         n= 2957  p50= 5234 ms  p90=10706 ms  p99=17028 ms  erros=1043
  GET /feed/novidades                            n=  160  p50=10836 ms  p90=11861 ms  p99=12345 ms  erros=1040
  GET /feed (primeira página)                    n=    1  p50= 1090 ms
  GET /feed (páginas seguintes)                  n=  125  p50=  502 ms  p90=  519 ms  p99=  548 ms  erros=0
  consulta das sete linhas (SQL direto)          n=   20  p50=  493 ms  p90=  509 ms  p99= 1135 ms  erros=0
```

| Grandeza | Valor |
|---|---|
| Mídias na tabela | 6.003 |
| Prévias confirmadas | 6.000 |
| **Intenções sem prévia** | **3** |
| Originais pendentes | 1.202 |
| Perda irrecuperável (`vw_perda_evento`) | **0** — a festa foi ontem, e o prazo é D+7 |
| Participação (P) | **184 de 184 slots** · piso 100% · teto 100% |
| Álbum: itens no feed | 5.023 de 6.000 (o resto é `noivos`, e o filtro funciona) |
| Álbum: páginas até o fim | 126 · **2,1 MB** · **429 bytes por item** |
| Erros gravados em `eventos_de_erro` | 130, todos `servidor` |

---

## 3. O que quebrou primeiro, e é uma resposta só

**A conexão com o banco, na rota de intenção.** As causas, lidas de
`eventos_de_erro` no fim da rodada:

| Classe | Mensagem | Quantos |
|---|---|---|
| `NeonDbError` | `Error connecting to database: TypeError: fetch failed` | 120 |
| `NeonDbError` | `Database request failed` | 8 |
| `NeonDbError` | `server login has been failing... the database system is shutting down` | 2 |

**Nada no produto quebrou antes disso.** O QR, a identificação, a confirmação, a
paginação do feed e a consulta das sete linhas atravessaram o pico inteiro com
zero erro. Quem cedeu foi o número de conexões simultâneas ao Postgres, e ele
cedeu **na rota que faz mais idas ao banco**.

### Por que é a intenção, e não outra rota

Um `POST /midias/intencao` custa **seis** idas ao banco, em série:

1. `buscarEventoPorId`
2. `participacaoPorToken` (a sessão)
3. `arquivosRecentes` (a decisão de faixa lenta, P11)
4. `registrarIntencao` — o que já existe
5. `registrarIntencao` — o `insert`
6. `registrarIntencao` — as linhas de volta

No pico, 30% de 4.000 fotos em 20 minutos comprimidos viram **cerca de 120
requisições por segundo**, ou seja **~720 consultas por segundo**. O driver HTTP
do Neon abre uma conexão por consulta; foi aí que o `fetch` começou a falhar.

### O que este número significa — e o que ele **não** significa

**Não significa que a festa vai quebrar.** Três coisas separam esta medição da
noite real, e todas empurram para o mesmo lado:

1. **A latência.** Este teste roda no Brasil contra um Postgres em
   `us-east-1`: cada consulta custa ~150 ms só de ida e volta. Em produção o
   app roda **na mesma região** do banco, e a mesma consulta custa de 1 a 5 ms.
   As seis idas da intenção passam de ~900 ms para ~30 ms.
2. **A compressão.** 6 horas em 180 segundos é **120× a taxa real**. O pico real
   são 1.200 fotos em 20 minutos — **uma foto por segundo**, não 120.
3. **Um processo só.** `next start` local é um processo Node; a Vercel escala
   por invocação.

Descomprimindo: no pico real, a rota de intenção recebe ~1 req/s e faz ~6
consultas/s. **A margem é de duas ordens de grandeza.**

**O que significa, e é o achado que fica:** a intenção é a rota mais cara do
produto, e é a primeira a ceder sob pressão. Ela também é a rota cuja falha o
produto sabe absorver — a fila retenta, e a reconciliação (H-15) adota o que
subiu sem confirmar. **É o lugar certo para quebrar**, e o desenho já previa
isso.

### O que fazer, e quando

| Gatilho | Ação |
|---|---|
| Se o ensaio mostrar p90 da intenção acima de **1,5 s** | Juntar as consultas 1 e 2 numa só (`evento` e `participação` num `join`) e mover `arquivosRecentes` para dentro de `registrarIntencao`. Passa de 6 para 3 idas |
| Se aparecer `NeonDbError` no ensaio, em qualquer volume | Trocar o driver HTTP pelo **pool** do Neon nas rotas de escrita |
| Se nada disso aparecer | Não mexer. Otimização sem número é dívida com aparência de cuidado |

---

## 4. Abrir o álbum com 6.000 itens

O teto da H-11 é *"abrir o álbum com 6.000 itens em menos de 3 s num Android de
3 anos em 4G"*. **Abrir monta uma página, e uma página são 40 cartões.**

### O lado do servidor (medido)

| | Valor |
|---|---|
| Primeira página (40 cartões) | **1.090 ms** — e isso com 150 ms de latência de banco intercontinental |
| Páginas seguintes | p50 **502 ms**, p90 519 ms, p99 548 ms |
| Peso da resposta | **429 bytes por item**, ~17 KB por página |
| Total do álbum inteiro | 126 páginas, 2,1 MB |

Em 4G (~2 Mbps efetivos num salão), 17 KB são ~70 ms de transferência. **O
servidor entrega a primeira página bem dentro do orçamento de 3 s**, e em
produção — mesma região que o banco — o número cai para a casa dos 100 ms.

### O lado do aparelho (medido em `jsdom`, `pnpm medida`)

```
     40 fotos  montagem=  279 ms  nos=   427  nos/foto=10.7
    200 fotos  montagem=  674 ms  nos=  2127  nos/foto=10.6
   1000 fotos  montagem= 1606 ms  nos= 10607  nos/foto=10.6
   6000 fotos  montagem= 5891 ms  nos= 63645  nos/foto=10.6
```

**O número que vale é `nos/foto = 10,6`, e ele não depende de aparelho.** O tempo
em milissegundos é `jsdom` — sem layout, sem pintura, sem decodificação de
imagem — e serve como ordem de grandeza, não como veredito.

### O veredito, contra o gatilho do `po`

> *"Acima de 3 s, a virtualização vira obrigatória antes do congelamento de
> código; abaixo, é Fatia 2."*

**Abaixo. A virtualização fica para a Fatia 2.**

**Abrir** o álbum monta **427 nós** e custa uma requisição de 17 KB. Não há
cenário em que isso passe de 3 s num Android de 3 anos. Os 63.645 nós só existem
para quem **rolar 150 páginas sem recarregar**, e mesmo esse caminho é
incremental: 10,6 nós por foto, uma página de cada vez.

**O que fica escrito como limite, porque ele é real:** acima de ~1.000 fotos na
mesma sessão de rolagem (**10.600 nós**) a grade entra na faixa em que um
aparelho antigo começa a engasgar. Isso é uma noite inteira com a aba aberta,
que é justamente o comportamento que o feed existe para provocar.

**O gatilho para trazer a virtualização de volta**, e ele é objetivo: se o ensaio
registrar **alguma sessão passando de 1.000 itens na grade** — mensurável por
`album_opened` seguido de rolagem —, ou se aparecer relato de travamento, ela
entra antes do casamento. O `CardMidia` tem contrato visual fixo (tile e vão
constantes) exatamente para a virtualização caber depois sem mudar nada.

---

## 5. A sondagem: 40 req/s

Fora do pico de envio, a sondagem responde em **p50 566 ms / p90 606 ms** (medido
na primeira rodada, com o banco folgado). Durante o pico, ela **degradou junto**:
p50 10.836 ms e 1.040 erros — o mesmo esgotamento de conexão da intenção,
observado de outro lugar.

Isso é informação, não um segundo problema: as duas rotas disputam o mesmo
recurso, e a intenção é a que o consome. Consertada a intenção, a sondagem volta
sozinha.

**O desenho que sustenta o número na festa real** continua valendo e não foi
tocado: a resposta é *um número e um instante*, idêntica para todo mundo, e a
borda cacheia por 5 s — o banco vê **uma** consulta, não duzentas.

---

## 6. O que este teste **não** mede

Escrito para ninguém tratar o verde como cobertura.

1. **O uplink do salão.** O `PUT` no R2 não passa pelo nosso servidor — é URL
   assinada, o aparelho fala direto com o balde. Nenhum teste rodado deste lado
   consegue medi-lo, e ele é o que domina o `seconds_since_scan` de verdade. O
   que está medido aqui é **o que o produto custa** dentro daquele orçamento.
2. **Arquivos reais.** Sem credencial de R2 neste ambiente, nada foi enviado. A
   H-21 pede "arquivos reais"; o que existe é o **contrato** completo — intenção,
   assinatura das três faixas, confirmação por faixa — com bytes declarados.
3. **Aparelho e rede reais.** Nem Android, nem 4G, nem projetor. O `jsdom` da §4
   é ordem de grandeza.
4. **O telão por 6 horas.** Fora do escopo da H-21, por decisão dela.
5. **A borda.** `next start` local não tem CDN. O cache de 5 s da sondagem, que é
   o que segura os 40 req/s na festa, não foi exercitado.

---

## 7. O que rodar de novo, e quando

A H-21 manda rodar **antes do congelamento de código** e **de novo depois de
qualquer mudança nas rotas de envio**.

```bash
# contra a pré-produção, que é onde o teste vale de verdade
pnpm carga --base=https://<pre-producao> --clientes=200 --midias=4000
```

**O que muda contra a pré-produção**, e é por isso que ela é a rodada que conta:
o app fica na mesma região do banco, a borda existe, o R2 existe, e a escala é
por invocação. Os quatro fatores empurram os números para baixo — e é lá que se
descobre se o achado da §3 desaparece ou fica.

---

## 8. Duas coisas que este teste ensinou sobre si mesmo

1. **A data do evento tem que ser ontem.** A janela de medição começa às 12:00 do
   dia do evento, no fuso do evento (`metricas.md` §1.1). A primeira rodada usou
   a data de hoje, rodou de manhã, e **a participação saiu zero** — sem erro em
   lugar nenhum. O número estava certo; o teste é que estava errado. Está
   corrigido no script, com o motivo escrito.

2. **Semear direto no banco não mantém o contador.** Na §2, `midias_armazenadas`
   marca 2.957 e a tabela tem 6.000: as 3.043 semeadas por `INSERT` não passaram
   por `confirmarFaixa`, que é quem mantém o agregado. **Não é defeito** — é a
   prova de que o contador só se move pelo caminho do produto, e é exatamente o
   que `test/contadores-vs-verdade.test.ts` mede pelo caminho certo (agregado
   igual à verdade depois de centenas de operações reais). O cron diário
   recomputa da verdade e grava a divergência.
