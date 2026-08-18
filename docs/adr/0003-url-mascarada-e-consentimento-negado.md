# ADR 0003 — URL mascarada no GA4 e consentimento negado por padrão

**Data:** 18/08/2026 · **Estado:** aceito

## Contexto

O `product-analytics` encontrou, no código que já estava no ar, que o
`gtag('config')` não declarava `page_location` nem `page_title`. Sem eles o gtag
lê o navegador sozinho. Medido no fio, com um Chrome de verdade, o que saía em
todo `page_view` era:

```
dl = http://localhost/e/ana-e-max
dt = Ana Flávia e Maxwel · domingo, 22 de agosto de 2027
Referer: http://localhost:3999/
```

Nome do casal por extenso no título, slug no endereço, endereço de novo no
cabeçalho `Referer` de toda requisição ao Google. O `wedding_id` já era dimensão
registrada e responde às mesmas perguntas sendo opaco — nada daquilo servia a
nenhuma análise.

O produto vai ganhar rota de álbum, de convidado e de mídia. O nome do convidado
é PII de terceiro: pior que a do casal, porque ele nem escolheu estar ali.

## Decisão

**1. Nenhuma URL do produto chega ao GA4 legível.** `page_location`,
`page_title` e `page_referrer` são declarados em todo hit, sempre mascarados,
por `lib/analytics-privacidade.ts`. Host real trocado por `casa-nos.invalid`
(RFC 2606), caminho reduzido a `/e/<wedding_id>` mais o que a **lista de
permitidos** deixar passar.

Lista de permitidos, e não de proibidos, porque uma lista de proibidos protege o
que já se conhece e libera tudo que for criado depois — que é exatamente quando
ninguém está olhando. Aqui rota nova nasce mascarada sem trabalho nenhum.

**2. `Referrer-Policy: no-referrer` no site inteiro.** Mascarar o corpo do hit e
deixar o cabeçalho teria trocado o vazamento de lugar. As tiles do OpenStreetMap
foram verificadas sem `Referer` e respondem 200.

**3. Modo de consentimento `denied` por padrão, sem banner de cookie.**
`analytics_storage`, `ad_storage`, `ad_user_data` e `ad_personalization` negados
antes do `config`.

**4. Uma porta só.** O `config` saiu do `<Script>` embutido — uma string de
JavaScript que não passa por `tsc`, nem por lint, nem por teste, e foi
exatamente ali que o vazamento morou. Todo `gtag()` mora em `lib/analytics.ts`.

## Consequências

**Bom:** o relatório para de fragmentar o mesmo casamento entre o domínio
próprio e o `/e/<slug>`, e para de fragmentar de novo quando um slug mudar. O
vazamento seguinte — o da rota de convidado — já nasce fechado.

**Custo, e ele é real:** com `analytics_storage: denied` o hit vira ping sem
cookie, o `cid` é gerado por hit e a costura de sessão degrada. O funil do GA4
fica aproximado. A dimensão "hostname" do GA4 fica inútil.

**Por que o custo é aceitável:** ele é de **diagnóstico, não de veredito**. O
número que decide este projeto — participação do convidado — sai de uma consulta
ao Postgres, por decisão anterior (`metricas.md` §0). Nenhuma decisão de negócio
depende do GA4 aqui, então o padrão barato é o padrão conservador.

**Por que sem banner:** o convidado não tem conta, não escolheu estar ali e é
fotografado por terceiros. Pedir consentimento para uma coleta de que não
precisamos seria trocar um passo a mais no fluxo dele por nada. Escolher o modo
mais privativo por padrão vale mais que perguntar.

## O que NÃO foi resolvido

O cabeçalho `origin` do `POST /g/collect` continua carregando o domínio do
casal. É obrigatório em requisição entre origens e nenhum código nosso o
controla. É a última superfície em que o domínio chega ao Google, e ela só some
junto com o GA4.

## Como isto é segurado

Regra escrita não segura nada. Três catracas, todas dentro de `pnpm verificar`:

- `test/analytics-sem-pii.test.tsx` — monta a página de verdade, aciona os
  eventos, e varre tudo o que foi entregue ao gtag atrás do nome do casal, do
  slug e do host. Traz junto uma guarda contra si mesmo: afirma que a URL e o
  título do cenário **contêm** a PII, para o arquivo não ficar verde no dia em
  que alguém trocar o cenário por um limpo.
- `test/analytics-privacidade.test.ts` — a aritmética do mascaramento, incluindo
  formas de URL que o produto ainda não tem.
- `test/analytics-gtag-unico.test.ts` — ninguém fala com o gtag fora de
  `lib/analytics.ts`.

As três foram verificadas com mutante: o conserto foi desfeito à mão, uma vez
por caminho, e cada teste ficou vermelho. A varredura de chamada direta
**falhou** no primeiro mutante — `window.gtag?.(` passou por cima de um regex
que procurava `gtag(` — e foi corrigida para procurar a palavra, não a sintaxe.
