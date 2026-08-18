# ADR 0001 — O evento é o inquilino

**Data:** 18/08/2026 · **Estado:** aceito

## Contexto

O pedido era um site de casamento no ar hoje. O casamento existe, os dados são
reais e o prazo é de horas. O caminho mais curto seria uma página com os nomes e
a data no código.

A decisão do dono no discovery (Q11) foi outra: **casal direto, com o evento já
modelado como inquilino**. As Fatias 1, 2 e 3 — álbum, feed, RSVP, lista de
presentes com checkout — crescem sobre este mesmo codebase.

## Decisão

`eventos` é a raiz do inquilino. Toda tabela de domínio carrega `evento_id` e
toda consulta filtra por ele no servidor. A requisição vira inquilino por
**domínio** (`evento_dominios`) ou por **slug** (`/e/<slug>`), nesta ordem, com
404 no fim — nunca "o primeiro evento da lista".

Nenhum dado do casamento está no código. Data, cidade, coordenada, o que está
publicado e o que não está: tudo vem do banco.

## Consequências

**Bom:** o segundo casal entra com dois `INSERT` e um domínio apontado, sem
migration e sem deploy. O teste de escopo nasceu com dois inquilinos, então
vazamento entre eles quebra o CI em vez de aparecer no dia do segundo cliente.

**Custo:** duas consultas e uma tabela a mais do que "a página do casamento da
Ana". Cerca de uma hora de trabalho a mais hoje.

**Por que valeu:** a alternativa não é "fazer depois", é **reescrever depois**.
Um `where empresa_id` acrescentado a um produto que já tem clientes é uma
migração de dados e uma auditoria de cada consulta existente. Acrescentar o
filtro quando existe um inquilino custa uma hora; quando existem trinta, custa um
incidente.

## Também decidido aqui: conteúdo é tabela tipada, não JSON

O dono definiu que o editor da Fatia 2 terá **seções fixas com conteúdo
editável** — não editor de blocos livre. O schema já reflete isso: colunas reais
em `eventos` para save the date, quando e onde; `evento_indicacoes` tipada, com
`tipo` sob `CHECK`. **Nenhum blob JSON de blocos genéricos.**

A diferença é o que o Postgres consegue validar, indexar e consultar. Um campo
`conteudo jsonb` aceitaria `{"data": "amanhã"}` sem reclamar, e a página
descobriria o problema na frente do convidado.

A tabela `evento_secoes` (ligar/desligar e ordenar seções) **não foi criada
hoje**: ela não teria consumidor nem teste, e acrescentá-la depois é migration
aditiva, sem migrar dado.

## Gatilho de reavaliação

Se o produto passar de ~50 eventos ativos e a consulta por domínio aparecer em
perfil de lentidão, avaliar cache de resolução de domínio na borda. Antes disso,
não.
