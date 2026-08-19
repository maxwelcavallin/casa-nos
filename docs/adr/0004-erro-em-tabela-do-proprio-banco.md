# ADR 0004 — o registro de erro mora numa tabela do próprio banco

**Data:** 19/08/2026 · **Estado:** aceito · **História:** H-18

## Contexto

O `escopo-core.md` §9 chama a ausência de observabilidade de **o pior débito da
tabela, com data: antes do ensaio**. O `stack.md` §8 diz a mesma coisa em uma
frase: erro em produção precisa chegar a algum lugar que uma pessoa lê, senão o
produto só descobre bug pelo cliente.

O PRD deixa a escolha explícita na H-18:

> **Schema:** opcional — tabela `eventos_de_erro` se a ferramenta escolhida não
> cobrir. Decisão do `dev-fullstack`, registrada em ADR se for banco.

Hoje o que existe é o log da Vercel: sem busca por evento, com retenção curta no
plano em uso, e sem nenhuma relação com as mídias daquele casamento.

## Decisão

**Uma tabela no próprio Postgres (`eventos_de_erro`, migration 0010)**, e não
uma ferramenta externa de rastreamento de erro.

## Por quê

**1. A pergunta da noite da festa é uma junção, não uma contagem.** O critério de
aceite pede o registro "consultável por evento e por hora". Mas a pergunta real,
às 23h, não é "quantos erros aconteceram" — é *"quais fotos deste casamento estão
sem prévia, e o que aconteceu com elas"*. Isso é um `join` entre `eventos_de_erro`
e `midias`. Uma ferramenta externa responde a primeira pergunta muito bem e a
segunda não responde de jeito nenhum, porque as mídias não estão lá.

**2. O `PUT` não passa por nós.** O aparelho manda os bytes direto para o R2 com
URL assinada. Um 403 do balde é invisível do lado do servidor — a única forma de
saber é o cliente relatar (`POST /api/interno/erro-cliente`), e o relato precisa
cair ao lado da mídia a que ele se refere.

**3. Zero dependência nova antes do ensaio.** O produto tem uma dependência de
banco e sobe direto para produção. Acrescentar um serviço externo agora significa
conta, chave, SDK no pacote do cliente e uma superfície a mais para configurar
errado — a duas semanas do ensaio, para responder pior à pergunta que importa.

## O que isso custa, e está aceito

- **Não há agrupamento por impressão digital, nem deduplicação, nem alerta
  pronto.** O alerta é uma consulta na janela de 15 minutos disparada na própria
  escrita, com debounce de 30 minutos gravado como uma linha de `origem = alerta`
  na mesma tabela.
- **Erro que derruba o banco não é registrado.** Se o Postgres estiver fora, o
  registrador falha em silêncio e sobra o `console`, que vai para o log da
  Vercel. É a limitação mais séria desta escolha, e ela é aceitável porque banco
  fora do ar é justamente o caso em que o produto inteiro está parado e visível.
- **Sem mapa de fonte, sem rastro de pilha do navegador.** O que o cliente relata
  é `error_kind` e um texto curto saneado.

## O que nunca entra na tabela

Nome, telefone, rótulo de convidado, conteúdo de foto, valor de cookie e token. O
tipo `RegistroDeErro` é fechado, e `sanearMensagem()` é a última barreira —
mensagem de exceção é o lugar mais fácil do mundo para um dado pessoal aparecer
sem ninguém planejar, porque `new Error(\`convidado ${rotulo} sem slot\`)` é a
forma natural de escrever uma exceção.

Uuid **fica**: ele é opaco e é a única coisa que liga um erro a uma mídia
específica na noite da festa. `test/observabilidade-sem-pii.test.ts` guarda as
duas metades.

## Gatilho de reavaliação

Qualquer um destes reabre a decisão:

1. **O ensaio real** mostrar que a consulta por evento e hora não é suficiente
   para diagnosticar em minutos.
2. O produto passar de **dois casamentos simultâneos**: aí o volume e a
   necessidade de agrupamento mudam a conta.
3. Alguém precisar de rastro de pilha do navegador com mapa de fonte para achar
   um defeito — o que a tabela não faz e não vai fazer.

## Alternativas consideradas

| Alternativa | Por que não agora |
|---|---|
| Sentry (ou equivalente) | Responde "quantos erros" muito bem; não junta com `midias`, que é a pergunta da noite. Volta como complemento se o gatilho 3 acontecer |
| Só o log da Vercel | Sem busca por evento, sem retenção útil, e nada relacionável às mídias. É o estado atual, e é o que a H-18 chama de débito |
| Tabela + ferramenta, os dois | Duas fontes de verdade sobre o mesmo fato, antes de existir uma festa. A hora de acrescentar a segunda é quando a primeira não bastar |
