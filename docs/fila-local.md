# A fila local — o contrato do registro no IndexedDB

**Fatia 1 · F1.2 · H-07** — atualizado em 19/08/2026

IndexedDB não é schema de banco, mas **é schema**: ele fica no aparelho do
convidado por 12 meses e sobrevive a deploy. Mudar a forma do registro depois da
festa significa que o celular de quem tem seis fotos pendentes acorda com dados
que o código novo não entende — e o produto perde exatamente as fotos que ele
existe para não perder.

Por isso ele está documentado aqui, e por isso ele tem `versao`.

---

## Onde fica

| Banco | Depósito | Chave | O que guarda |
|---|---|---|---|
| `casa-nos-fila` (versão 1) | `itens` | `clientMediaId` | O registro (pequeno, lido inteiro a cada ciclo) |
| | `blobs` | `<clientMediaId>:<faixa>` | Os bytes (grandes, lidos um por vez) |

**Dois depósitos, e a separação é funcional.** Guardar o blob dentro do registro
faria cada varredura da fila carregar dezenas de megabytes na memória de um
celular que já está com dificuldade.

Índice `porEvento` em `itens.eventoId`: um aparelho pode ter ido a dois
casamentos, e sem o índice a fila de um apareceria no indicador do outro.

---

## O registro

Definido em `lib/fila/tipos.ts`. Os campos, e o que cada um decide:

| Campo | Decide |
|---|---|
| `versao` | A migração futura. Hoje `1` |
| `clientMediaId` | A identidade do item, aqui e no servidor. É a chave da idempotência (RN-13) |
| `eventoId`, `participacaoId` | De quem é a foto, e de que casamento |
| `loteId` | O agrupamento de rajada no feed (B11) — um por seleção |
| `visibilidade` | `feed` ou `noivos`. **Dois valores** (RN-03) |
| `origem` | `camera` ou `galeria` — vira `media_source` no GA4 |
| `tipoArquivo`, `bytes`, `nomeLocal` | O que a intenção declara ao servidor |
| `hashConteudo` | sha-256 do arquivo. De-duplica reenvio por precaução |
| `criadoEm` | Vira `queue_age_seconds` no evento de sucesso |
| `enfileiradaOffline` | Estava sem rede na hora da escolha. Viaja até o GA4 |
| `midiaId`, `urls`, `urlsExpiramEm` | **Só existem depois da intenção.** É o que prova que o servidor sabe da foto |
| `faixas` | Estado de cada objeto: `pendente`, `confirmada`, `pendente_servidor` |
| `tentativas`, `proximaTentativaEm`, `ultimaFalha` | O recuo crescente |
| `eventoDisparado` | A marca que impede `media_upload_succeeded` de contar duas vezes (RN-28) |

### Três campos que parecem detalhe e não são

**`midiaId` nasce nulo.** É o que torna visível, no próprio registro, que a
intenção ainda não foi registrada. Um item com `midiaId` nulo não tem URL para
onde subir — e é exatamente por isso que **a H-06 vem antes da H-07** (PRD §9.1):
uma fila construída sem este campo nasceria com um contrato de rede que não
registra intenção, e acrescentá-lo depois obrigaria a migrar as filas já
gravadas nos aparelhos de teste.

**`eventoDisparado` mora no disco, não em memória.** Uma confirmação repetida do
servidor — que acontece, porque a fila reconfirma quando não tem certeza — viraria
um segundo evento de sucesso. Participação inflada por retentativa é o erro mais
fácil de cometer neste produto e o mais difícil de perceber depois.

**`faixas.previa = "pendente_servidor"`** não é erro. É o formato que o navegador
não decodificou (HEIC exótico, B8): o original sobe direto e a prévia é trabalho
do cron (decisão P12). Na interface isso é "chegando", **nunca** "falhou".

---

## O ciclo, em quatro passos

```
1. arquivo copiado para o IndexedDB      antes de qualquer rede
2. INTENÇÃO registrada no servidor       antes de qualquer byte de imagem
3. PUT das faixas no R2                  os bytes
4. confirmação por faixa                 o carimbo que conta
```

**Entre 1 e 2** o aparelho pode ficar offline por dias: o item está no disco e a
intenção sai quando houver rede.

**Entre 2 e 3** o navegador pode morrer: a linha de intenção **fica** no banco, e
é ela que a reconciliação (H-15) vai procurar. A foto aparece como perdida — que
é a verdade — em vez de não existir para ninguém.

**Entre 3 e 4** o objeto pode existir no R2 sem carimbo. É o caso que a
reconciliação resolve com um `HEAD` na chave esperada: ela adota o objeto e
carimba a mídia.

---

## As regras do motor (`lib/fila/motor.ts`)

- **Prévia primeiro, sempre.** É a faixa que conta (RN-14). O original é
  qualidade, e pode levar dias.
- **Concorrência 3 na prévia, 1 no original.** Com `faixaLenta`, 1 e 1 —
  despriorização, **nunca** recusa (RN-11).
- **Recuo 2, 5, 15, 60 s, com teto.** Sem teto, o item dormiria depois de a rede
  ter voltado.
- **Nenhum limite de tentativas** enquanto o item existir. Limite transformaria
  "adiou" em "perdeu".
- **O blob de uma faixa some quando ela confirma.** O item só sai do IndexedDB
  quando **as duas** confirmam.
- **O original é guardado sempre**, e é a única cópia que existe se o convidado
  apagar a foto da galeria depois de escolher.

---

## O que o teste cobre, e o que ele não cobre

`test/fila-motor.test.ts` roda o salão dentro do CI, com a rede injetada:
modo avião intermitente, portal cativo respondendo HTML com status 200, 500 do
servidor, URL expirada depois de uma noite, 409 fora da janela, vídeo no lote,
retomada num "aparelho novo" sobre o mesmo disco.

**O que ele não prova, e só aparelho de verdade prova:** throughput real, o
comportamento do IndexedDB sob pressão de espaço, o congelamento de aba do iOS, e
a recusa de `navigator.storage.persist()`. Esses quatro estão na lista do ensaio.

---

## Se este contrato mudar

1. Suba `VERSAO_DO_REGISTRO` e a versão do banco IndexedDB.
2. Escreva a migração no `onupgradeneeded` de `lib/fila/armazem.ts` — nunca
   `deleteDatabase`, que apaga a fila de quem tem foto pendente.
3. Atualize este arquivo no mesmo commit.
