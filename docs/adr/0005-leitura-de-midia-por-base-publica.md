# ADR 0005 — A mídia é lida por uma base pública, e não por URL assinada

**Data:** 19/08/2026 · **Fatia:** 1, F1.4 (H-11, H-12)
**Status:** aceito, **com uma decisão de produto pendente** — ver "O que falta"
**Gatilho de reavaliação:** o teste de carga da H-21 (F1.7), ou o primeiro
casamento em que uma foto `noivos` vaze por URL.

---

## O buraco

O PRD fixa o **layout das chaves** no R2 (§5.5) e o `lib/r2.ts` implementa a
assinatura de `PUT`. Nenhum dos dois diz como a mídia é **lida** — e a F1.4 é a
primeira fatia que precisa ler: o feed mostra 6.000 miniaturas e o telão mostra
prévias a noite inteira.

Não é contradição entre documentos; é uma decisão que ninguém tomou porque só
agora ela apareceu.

## As duas saídas

**(a) Uma rota nossa assina cada `GET`** e redireciona. Cada miniatura vira uma
invocação de função.

**(b) O balde é servido por um domínio público**, e a URL é montada a partir da
chave.

## A escolha, e a aritmética que a sustenta

**(b).** O teto da H-11 é *"abrir o álbum com 6.000 itens em menos de 3 segundos
num Android de 3 anos em 4G"*. Com (a), abrir o álbum seria **uma invocação de
função por miniatura** — e nenhuma borda consegue cachear uma URL assinada, que
muda a cada pedido. Não é uma questão de custo: é a diferença entre o teto ser
alcançável e não ser.

O que torna (b) defensável é a chave, que o PRD já fixou:

```
e/<evento_id>/m/<midia_id>/t.jpg
```

Dois uuid v4. Adivinhar um é 122 bits de busca. E o modelo de acesso do produto
já é o de credencial ao portador: o link do álbum é (B14), o link do telão é, o
link guardado é.

## O que muda de postura, e está declarado

**Quem tiver a URL exata de uma foto a vê sem sessão — inclusive uma foto
`noivos`.**

Uma foto `noivos` nunca é **listada** para ninguém além de quem enviou e do
casal: o filtro está na consulta do feed, na do telão e na de "as minhas fotos",
e `test/feed.test.ts` guarda os quatro filtros. Mas a URL dela, se vazar, abre.

Isso é uma postura mais fraca do que "só quem tem sessão vê", e ela está aceita
de olhos abertos — não por descuido. As três formas de a URL vazar, e o que
existe contra cada uma:

| Como vaza | O que existe |
|---|---|
| A pessoa copia o endereço da imagem e manda | Nada. É o mesmo que ela salvar a foto e mandar — e isso o produto nunca conseguiu impedir |
| Um `Referer` leva a URL a um terceiro | `Referrer-Policy: no-referrer` no site inteiro (RN-31d) |
| Um índice de busca acha o balde | `noindex` nas telas do álbum; o balde não tem listagem, e a chave não é adivinhável |

## O original fica de fora, e a função recusa

`urlPublica` aceita `miniatura` e `previa`, e **não** `original`. O original é o
arquivo do casal, carrega EXIF (inclusive GPS, RN-18) e nunca é servido numa
grade. O download dele é a H-20 (F1.7), por rota assinada e com sessão.

A recusa está no tipo, e não num comentário: quem tentar "só reaproveitar" a
função para o original não compila.

## O que falta, e é decisão de produto

1. **Confirmação do `po`/`pm-lead`** de que a postura acima é aceitável para uma
   foto `noivos`. Se não for, a saída não é assinar o `GET` de tudo — é servir a
   **miniatura** por base pública e a **prévia** por rota assinada, o que
   preserva o teto da grade e fecha a foto aberta. Custa uma rota e está
   desenhado.
2. **Configurar `R2_PUBLIC_BASE`** com um domínio próprio (não o `r2.dev`, que
   tem limite de taxa e não serve uma festa).
3. **Regra de ciclo de vida por prefixo `e/<evento_id>/`** para os 12 meses (Q9)
   — configuração de balde, não código, como o PRD §5.5 previu.

Sem `R2_PUBLIC_BASE`, `urlPublica` devolve `null`, a grade renderiza os tiles sem
imagem e **nada quebra**: as telas continuam abrindo, o botão de enviar continua
funcionando e o envio continua acontecendo. É o lado certo de degradar.
