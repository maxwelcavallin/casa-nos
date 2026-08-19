# ADR 0005 — Dois prefixos no balde: `pub` é servido, `prv` não

**Data:** 19/08/2026 · **Fatia:** 1, F1.4 a F1.7 (H-10, H-11, H-12, H-14, H-20)
**Status:** aceito. **Substitui integralmente a primeira redação deste ADR**
("A mídia é lida por uma base pública"), de 19/08/2026, que foi **rejeitada**.
**Regra de negócio:** RN-33, decisão do `po` de 19/08/2026.

---

## A decisão anterior, e por que ela caiu

A primeira redação deste ADR escolheu servir **toda** a mídia por um domínio
público, apoiada na chave não adivinhável (`e/<evento_id>/m/<midia_id>/…`, dois
uuid v4, 122 bits), e declarou a consequência de olhos abertos:

> *"Quem tiver a URL exata de uma foto a vê sem sessão — inclusive uma foto
> `noivos`."*

**Isso não podia ficar, e o motivo não é de segurança abstrata.** O produto
imprime na tela, para a convidada, no momento em que ela escolhe:

> **Só os noivos veem esta foto.**

E a razão entre os dois botões de envio é **a hipótese central que a Fatia 1
existe para medir**. Uma promessa que depende de ninguém descobrir a URL é falsa
por construção — e mediríamos uma escolha cuja consequência o produto não
cumpre. O número sairia, seria bonito, e não significaria nada.

A alternativa já estava desenhada no fim da própria redação anterior ("miniatura
pública, prévia assinada"). O `po` arbitrou uma versão mais forte dela, e é a
que está implementada.

---

## A decisão

**O balde tem dois prefixos, e a separação é de segurança — não de arrumação.**

```
pub/e/<evento_id>/m/<midia_id>/t.jpg    miniatura de mídia `feed`
pub/e/<evento_id>/m/<midia_id>/p.jpg    prévia    de mídia `feed`
prv/e/<evento_id>/m/<midia_id>/t.jpg    miniatura de mídia `noivos`
prv/e/<evento_id>/m/<midia_id>/p.jpg    prévia    de mídia `noivos`
prv/e/<evento_id>/m/<midia_id>/o.<ext>  ORIGINAL — sempre, em toda visibilidade
```

| Faixa | Visibilidade | Como é lida |
|---|---|---|
| miniatura, prévia | `feed` | Domínio público, chave não adivinhável, cacheável |
| miniatura, prévia | `noivos` | **URL assinada, 15 minutos** |
| original | qualquer | **URL assinada, 15 minutos**, só pela rota de download (H-20) |

`pub/` é servido por um domínio próprio. **`prv/` não é servido por ninguém sem
assinatura.**

### Por que `feed` continua público

É o caminho quente. São 200 aparelhos puxando miniatura pelo mesmo uplink de
salão, e o teto da H-11 é abrir o álbum com 6.000 itens em 3 s num Android de 3
anos em 4G. URL estável é URL que a borda e o navegador cacheiam; URL assinada
muda a cada pedido e não cacheia em lugar nenhum.

E a exposição é real, mas conhecida e aceita: a chave tem dois uuid v4, o balde
não tem listagem, e **a foto `feed` é a foto que a pessoa mandou para a festa**.
O modelo de acesso do produto já é de credencial ao portador — o link do álbum é
(B14), o link do telão é, o link guardado é.

### Por que o original nunca é público

Ele carrega EXIF, inclusive GPS (RN-18), nunca é servido numa grade, e é o
arquivo do casal. `urlPublicaDeFeed` **recusa a faixa `original` no tipo**: quem
tentar reaproveitá-la não compila.

---

## A parte difícil: `feed` → `noivos`

Uma foto que muda de visibilidade **muda de prefixo**. Sem isso, o endereço
público antigo continuaria abrindo — e a decisão inteira seria decorativa.

A coreografia está em `lib/r2-objetos.ts` e `lib/visibilidade.ts`:

```
feed → noivos   copiar para prv/ · apagar de pub/ · purgar a borda ·
                CONFERIR que o endereço público parou de responder ·
                só então escrever a coluna

noivos → feed   copiar para pub/ · escrever a coluna · recolher prv/
```

**A ordem é a garantia, e ela não é intercambiável:**

1. **copiar** — falhando aqui, nada mudou e a foto continua acessível. Abortar é
   seguro.
2. **apagar** — falhando aqui, a cópia em `prv/` é lixo inofensivo e o público
   continua de pé. Abortar.
3. **purgar** — melhor esforço. O passo 4 é quem decide.
4. **conferir** — **é este o critério.** Enquanto o endereço público responder, a
   promessa é falsa e a troca não pode ser confirmada.

**"Inclusive na borda, não só na origem"**, e essa metade é a que apareceria
meses depois como bug de cache: o domínio público do R2 fica atrás da CDN da
Cloudflare. Apagar na origem e conferir só a origem daria verde enquanto a borda
continuasse servindo a foto por horas, para quem tivesse o endereço.

**Se o movimento falhar, a troca falha inteira** e a coluna não muda. A rota
responde **503**, e a mensagem que a H-10 já mandava dizer — *"Não conseguimos
mudar agora. Continua na festa."* — passa a ser verdadeira.

### A assimetria ao abrir, e por que ela existe

Abrindo (`noivos` → `feed`), o risco muda de lado: apagar `prv/` antes do banco
e a escrita falhar deixaria a foto `noivos` **sem objeto**, e a convidada abriria
"as minhas fotos" com um tile quebrado no lugar da própria foto. Lixo em `prv/` é
o erro barato; o cron recolhe.

### A guarda contra a falha parcial

Não há transação entre o banco e o balde. A coreografia aborta antes do banco
quando falha — **mas o processo pode morrer no meio** (a plataforma encerra a
função), e aí sobra uma mídia `noivos` com objeto em `pub/`.

Por isso o cron diário (H-15) **varre `pub/` atrás de objeto cuja mídia esteja
`noivos` ou excluída**, apaga o que achar, purga a borda e **registra**. Sem essa
varredura, a promessa ficaria quebrada em silêncio — que é o único modo de falha
que este produto não pode ter.

Objeto **sem linha no banco** também é tratado como indevido, e não ignorado: ele
não pode existir (o `midia_id` nasce da linha de intenção), então se apareceu,
alguma coisa escreveu no balde por fora.

---

## Como isto foi provado sem um balde

`lib/r2-objetos.ts` fala com o R2 por uma porta (`ClienteDeObjetos`). Sem ela, a
coreografia acima só seria verificável com um balde e um domínio reais — ou seja,
**nunca antes da festa**.

`test/visibilidade-move-objetos.test.ts` prova, com um balde falso:

- a **ordem** dos quatro passos, com o índice de cada um;
- que **a borda que continua respondendo reprova a troca** (o caso do token de
  purga não configurado);
- que uma falha de cópia **aborta antes de apagar**;
- que a coluna **não muda** quando o movimento falha;
- que a varredura apaga o objeto público de mídia `noivos`, de mídia excluída e
  de mídia sem linha, e **não apaga** o da mídia `feed` legítima.

`test/r2-assinatura.test.ts` prova o resto:

- o layout das chaves nos dois prefixos, por extenso;
- que a URL de leitura de `noivos` **não contém o domínio público** nem como
  prefixo nem como parâmetro, mesmo com ele configurado;
- que **sem credencial de R2 a foto `noivos` não tem endereço nenhum** — a
  resposta é `null` e a grade renderiza o tile sem imagem. Uma implementação que
  caísse para a base pública aqui reabriria o buraco inteiro no primeiro ambiente
  mal configurado;
- que a assinatura de leitura vale 15 minutos;
- que o `response-content-disposition` do download entra **dentro** da
  assinatura — fora dela, quem tem o link reescreveria o nome do arquivo.

**O que continua não provado, e é honesto dizer:** que o domínio público está
configurado com a regra de acesso certa, e que a purga da Cloudflare funciona com
o token daquele ambiente. As duas são configuração, e a segunda tem um plano B
embutido — a conferência do passo 4 reprova a troca se a borda não limpar.

---

## Um limite que fica escrito

**A assinatura não é a única tranca, e nem é a principal.** A principal é que a
URL de uma foto `noivos` **só é gerada dentro de uma resposta que já exigiu a
sessão certa**: `/api/eventos/[id]/minhas` (a própria participação) e as rotas do
painel (`midia.ver.todas`). O feed, o telão e a sondagem nunca chegam lá com
`noivos`, porque a cláusula deles filtra `visibilidade = 'feed'` antes.

A assinatura é o que faz a URL **não sobreviver ao encaminhamento**: 15 minutos
depois, o print do endereço colado num grupo não abre nada.

**A moderação não é uma fronteira de privacidade.** Uma foto `feed` pendente de
aprovação já está em `pub/` e já tem endereço — ela só não está **listada**. Isso
é de propósito: a fila decide o que aparece no álbum e na parede, e o casal já
tem a foto desde a intenção (H-13). Quem confundir as duas coisas vai procurar
uma tranca que este ADR não promete.

---

## O que muda em quem opera

1. **`R2_PUBLIC_BASE`** — domínio próprio servindo **apenas o prefixo `pub/`**.
   Não o `r2.dev` (limite de taxa; não serve uma festa) e **não o balde
   inteiro**: se o domínio servir a raiz, `prv/` fica público e a decisão deste
   ADR é anulada por configuração.
2. **`CF_ZONE_ID` e `CF_API_TOKEN`** — para a purga de borda. Sem eles a purga
   não roda; a conferência do passo 4 continua rodando e **reprova a troca** se a
   borda ainda responder. É o lado certo de degradar: falhar, e não mentir.
3. **Duas regras de ciclo de vida**, uma por prefixo, para os 12 meses (Q9):
   `pub/e/<evento_id>/` e `prv/e/<evento_id>/`. Eram uma; agora são duas.

Sem `R2_PUBLIC_BASE`, `urlPublicaDeFeed` devolve `null`, a grade renderiza os
tiles sem imagem e **nada quebra**: as telas continuam abrindo, o botão de enviar
continua funcionando e o envio continua acontecendo.

---

## Gatilho de reavaliação

- Um `PUT` para `pub/` que a regra do domínio não recuse (ou seja: se algum dia o
  domínio público passar a servir a raiz do balde).
- Qualquer objeto indevido encontrado pela varredura do cron em produção — ele
  significa que uma troca abortou no meio, e a frequência decide se a coreografia
  precisa de uma tabela de trabalho em vez de acontecer em linha.
- Se o custo de leitura assinada de `noivos` aparecer no p90 de "as minhas
  fotos": a saída é a mesma de sempre — bucketizar o carimbo da assinatura por
  janela de tempo, o que torna a URL estável dentro da janela e cacheável.
