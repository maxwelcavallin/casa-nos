# ADR 0002 — Mapa montado com tiles do OpenStreetMap, sem chave de API

**Data:** 18/08/2026 · **Estado:** aceito
**Substitui:** a primeira versão desta decisão, que usava o iframe de embed do
OpenStreetMap. O motivo da troca está em "O que deu errado", abaixo.

## Contexto

O casal quer **o mapa visível e o nome do local escondido**: o convidado entende
para que lado da cidade vai e o estabelecimento não é identificável. O formato
escolhido pelo dono foi **área aproximada, sem pin** — zoom afastado, região
destacada, nenhum marcador.

Não havia credencial de mapa disponível, e não era para inventar nem reutilizar
credencial de outro projeto.

## Decisão

Tiles do OpenStreetMap (`tile.openstreetmap.org/{z}/{x}/{y}.png`) montadas pelo
próprio produto, numa malha 3×3, com a área destacada desenhada por cima.

A geometria vive em `lib/mapa.ts`, separada do componente, e tem teste próprio.
Tiles e área penduram na **mesma âncora** — o ponto central, em 50%/50% do
contêiner —, então elas coincidem por construção.

Nenhuma credencial. O crédito da licença é renderizado como texto nosso, em
`caption`, abaixo do mapa, com link vivo para `openstreetmap.org/copyright`.

## O que deu errado na primeira versão, e por que o embed não dava para salvar

A primeira versão usava `openstreetmap.org/export/embed.html` num iframe, com o
círculo posicionado no centro do contêiner. **O círculo apontava para o lugar
errado, e o erro mudava com a largura da tela.**

O embed desenha as tiles numa área e coloca a barra de atribuição por baixo,
dentro do mesmo documento. A área de tiles é (altura do iframe − altura da
barra), então o centro geográfico fica `barra / 2` acima do centro do contêiner.
Medido em 390px: barra de ~62px (três linhas nessa largura), 31px de desvio — com
`raioMetros = 4000`, cerca de **2 km ao sul**, metade do círculo caindo no mar.

**Nenhum recorte resolvia.** Qualquer posicionamento do iframe deixa exatamente
`barra / 2` de resíduo, e a barra ocupa uma linha no desktop e três em 320px. A
altura dela vive num documento de outra origem: não dá para medir nem estilizar.
Compensar com número fixo faria a mesma página apontar para lugares diferentes
conforme o aparelho.

Havia um segundo defeito no mesmo lugar: com `pointerEvents: "none"` (necessário,
porque a área é desenhada em coordenada de tela e o mapa não podia se mover), os
botões +/− do OSM continuavam visíveis com ~30px e **não faziam nada**, e a barra
de atribuição ocupava 19% do quadrado no celular, em azul e rosa que não são
desta página, pedindo doação — com todos os links mortos. O crédito obrigatório
por licença estava na tela **sem funcionar**.

Montar as tiles resolve os dois: o centro passa a ser uma coordenada que o
produto calcula, e a interface do outro produto some do convite.

## Alternativas descartadas

**Google Maps (embed ou estático):** exige chave. Uma chave de mapa num site
público é uma chave exposta, com cota que qualquer visitante pode gastar.

**Imagem estática gerada no build:** mais leve, mas congelaria a região no
momento do build e exigiria um passo a mais para revelar o endereço depois. O
requisito era que a revelação fosse mudança de dado.

**Desistir do círculo e deixar só o enquadramento** (uma das saídas que o revisor
ofereceu): resolveria a centralização, mas perderia a leitura de "é esta área, e
ela é aproximada de propósito" — que é justamente o que a seção precisa dizer
enquanto o local não é divulgado.

## Consequências

**Bom:** zero credencial, zero cota, e a centralização virou aritmética com
teste em vez de acerto visual. A revelação (`regiao` → `exato`) continua sendo um
`UPDATE`: o mesmo componente desenha os dois.

**Custo:** 9 tiles (~150KB) em vez de um iframe. Elas carregam com prioridade
baixa para não competir com o hero.

**Limite conhecido:** a malha 3×3 cobre um mapa de até 512px; por isso
`LARGURA_MAXIMA_MAPA` é 400. Subir esse teto exige malha 5×5 (25 tiles), e o
teste `test/mapa.test.ts` quebra se alguém subir um sem o outro.

**Risco:** `tile.openstreetmap.org` é um serviço gratuito de terceiro, sem SLA, e
a política de uso dele pede volume modesto — o que um site de casamento é. Se
sair do ar, o quadrado fica na cor de fundo e o botão continua funcionando.

## Gatilho de reavaliação

Se o produto passar a servir muitos casamentos, a política de uso das tiles do
OSM deixa de ser adequada e entra um provedor de tiles com plano pago
(MapTiler, Stadia) — a troca é a URL em `lib/mapa.ts`.
