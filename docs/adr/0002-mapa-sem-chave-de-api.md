# ADR 0002 — Mapa por embed do OpenStreetMap, sem chave de API

**Data:** 18/08/2026 · **Estado:** aceito

## Contexto

O casal quer **o mapa visível e o nome do local escondido**: o convidado entende
para que lado da cidade vai e o estabelecimento não é identificável. O formato
escolhido pelo dono foi **área aproximada, sem pin** — zoom afastado, região
destacada, nenhum marcador.

Não havia credencial de mapa disponível, e não era para inventar nem reutilizar
credencial de outro projeto.

## Decisão

Embed do OpenStreetMap (`openstreetmap.org/export/embed.html`), que não pede
credencial nenhuma. A caixa geográfica é calculada a partir do ponto e do raio
guardados no banco, e a área é desenhada **por cima**, em coordenada de tela.

O mapa embutido **não é arrastável**. Consequência direta do desenho: a área é um
elemento de tela sobre um mapa estático, e se o mapa se movesse o círculo ficaria
parado e passaria a marcar o lugar errado. Quem quiser explorar tem o botão, que
abre o mapa de verdade — num zoom que acompanha o nível de revelação (bairro em
`regiao`, rua em `exato`).

## Alternativas descartadas

**Google Maps Embed:** exige chave. Uma chave de mapa num site público é uma
chave exposta, com cota que qualquer visitante pode gastar — e o custo não é só
financeiro: restringir por referrer é a única defesa, e ela quebra quando o
domínio muda.

**Imagem estática gerada no build:** mais leve, mas congelaria a região no
momento do build e exigiria um passo a mais para revelar o endereço depois. O
requisito era que a revelação fosse mudança de dado.

**Nenhum mapa até o endereço sair:** era o estado anterior, e o dono decidiu
contra — a região é informação útil para quem precisa comprar passagem e reservar
hotel com um ano de antecedência.

## Consequências

**Bom:** zero credencial, zero custo, zero cota. A revelação (`regiao` → `exato`)
é um `UPDATE`: o mesmo componente desenha os dois, e ninguém abre o editor no dia.

**Custo:** o desenho da região é aproximado — um círculo em pixels sobre uma
caixa geográfica. Para "que lado da cidade" isso basta; para navegação, não — e
por isso o mapa não finge ser navegável.

**Risco:** o embed do OSM é um serviço gratuito de terceiro, sem SLA. Se ele sair
do ar, o card fica vazio e o botão continua funcionando. Não é o fim do mundo
numa página cuja informação essencial é a data.

## Gatilho de reavaliação

Quando o endereço for divulgado e a página passar a precisar de rota ponto a
ponto, comparar de novo com o Google Maps — aí o pin é o produto, e uma chave
restrita por domínio pode se pagar.
