# Analytics — casa-nos

Ferramenta: **GA4**. Implementação em `lib/analytics.ts` (envio, tipado),
`lib/analytics-privacidade.ts` (mascaramento de URL) e
`components/analytics/GoogleAnalytics.tsx` (carga do script).

**Nenhum evento existe fora deste arquivo.** Evento criado direto no código, sem
entrar aqui, é evento que ninguém sabe o que significa em três meses. A união de
tipos em `lib/analytics.ts` é o que torna a regra executável: nome que não está
lá não compila.

**Nenhum `gtag()` existe fora de `lib/analytics.ts`.** Não é convenção: é onde a
URL é mascarada, e `test/analytics-gtag-unico.test.ts` quebra o CI se aparecer
uma chamada em outro arquivo.

---

## Limites do GA4 que este produto respeita

- Nome de evento diferencia maiúscula: `map_opened` e `Map_Opened` são dois
  eventos.
- **Parâmetro enviado e não registrado como dimensão personalizada é dado
  perdido.** O GA4 não preenche o passado. Registre `wedding_id`,
  `map_precision`, `recommendation_kind` e `recommendation_position` na interface
  **antes** de divulgar o link.
- Nomes reservados (`page_view`, `session_start`, `first_visit`) são usados como
  reservados, não reinventados — o GA4 já tem relatório pronto para eles.
- **Campo de página omitido não é campo neutro.** Sem `page_location` o gtag lê
  `document.location`; sem `page_title`, `document.title`; sem `page_referrer`,
  `document.referrer`. Os três precisam ir declarados em todo hit. Ver abaixo.

---

## Privacidade

### O vazamento que já aconteceu, e que este arquivo existe para não repetir

Até 18/08/2026 o `gtag('config')` não declarava `page_location` nem
`page_title`. O gtag então lia o navegador sozinho, e o que saía em **todo
`page_view`** era, medido no fio:

```
dl = http://localhost/e/ana-e-max
dt = Ana Flávia e Maxwel · domingo, 22 de agosto de 2027
Referer: http://localhost:3999/
```

O nome do casal, por extenso, no `page_title`; o slug, que é o nome de novo, no
`page_location`; e o endereço completo mais uma vez no cabeçalho `Referer` de
toda requisição ao Google. Nada disso servia a nenhuma pergunta: o `wedding_id`
já era dimensão registrada e responde a mesma coisa sendo opaco.

**O erro não era um campo errado, era um campo AUSENTE.** Não havia o que ler
numa revisão de código. Por isso a verificação hoje é observacional
(`test/analytics-sem-pii.test.tsx`): monta a página, aciona os eventos, e varre
o que foi entregue ao gtag atrás das palavras que não podem estar lá.

### As regras que valem agora

| Item | Regra |
|---|---|
| Identificador do casamento | `wedding_id`, o uuid do evento. Opaco, e é dado de inquilino, não de pessoa |
| Nome do casal | **Nunca sai.** Nem em parâmetro, nem em título, nem em URL |
| Nome do convidado | **Nunca sai.** Quando a Fatia 1 existir, o que viaja é o uuid da linha |
| `page_location` | `https://casa-nos.invalid/e/<wedding_id>` — host sintético e caminho mascarado |
| `page_title` | O caminho mascarado, nunca o título real |
| `page_referrer` | Interno vira URL mascarada; externo fica só a origem, sem caminho e sem consulta |
| Cabeçalho `Referer` | Desligado por `Referrer-Policy: no-referrer` em `next.config.mjs` |
| Foto, telefone, e-mail | Nunca. Nem nome de arquivo, nem miniatura |

Sem `NEXT_PUBLIC_GA_MEASUREMENT_ID` configurado, **nada carrega**: nenhum script,
nenhuma requisição a domínio de terceiro, nenhum cookie. É melhor que um id
inventado, que mandaria os dados deste casamento para a propriedade de outra
pessoa.

### Como o mascaramento funciona

`lib/analytics-privacidade.ts`. A regra é **lista de permitidos, não de
proibidos** — o padrão é mascarar:

```
/                                  → /e/<wedding_id>
/e/ana-e-max                       → /e/<wedding_id>
/e/ana-e-max/album                 → /e/<wedding_id>/album
/e/ana-e-max/convidado/joao-silva  → /e/<wedding_id>/convidado/_
/rota-que-ainda-nao-existe         → /e/<wedding_id>/_
```

- O host real some sempre. Um domínio próprio de casamento (`anaemax.com.br`) é
  o nome do casal escrito de outro jeito. Separar inquilino é trabalho do
  `wedding_id`. `.invalid` é reservado pela RFC 2606, então quem abre o
  relatório vê de imediato que o endereço é sintético.
- As duas formas de endereçar o mesmo casamento — domínio próprio e `/e/<slug>`
  — colapsam no mesmo caminho. Ganho colateral: o relatório para de fragmentar,
  hoje e no dia em que um slug for renomeado.
- **Da consulta só sobrevivem os `utm_*`.** `?nome=`, `?convidado=`, telefone —
  tudo o mais é descartado sem olhar. O campo novo de amanhã não vaza sozinho.
- O fragmento (`#...`) some inteiro.
- Um `wedding_id` que não seja uuid vira `_`. Isso protege o erro mais provável
  daqui para a frente: passar `evento.slug` no lugar de `evento.id`.

**Rota nova nasce mascarada.** Quando a Fatia 1 criar uma superfície e você
quiser vê-la separada no relatório, acrescente a palavra a `SEGMENTOS_PUBLICOS`
em `lib/analytics-privacidade.ts`, **no mesmo commit da rota**. Declarar a
palavra não cria rota nenhuma: só afirma que ela nomeia uma superfície do
produto, e não uma pessoa.

### Consentimento: `denied` por padrão, e sem banner

Decisão do dono, 18/08/2026. `analytics_storage`, `ad_storage`, `ad_user_data` e
`ad_personalization` todos em `denied` no `gtag('consent', 'default', ...)`,
empilhado **antes** do `config` — depois dele o primeiro `page_view` já teria
saído sob o padrão do gtag, que é `granted`.

**O que isso custa:** o hit vira ping sem cookie, a costura de sessão degrada e
o funil do GA4 fica aproximado. Custa **diagnóstico, não veredito** — o número
que decide este projeto sai de uma consulta ao Postgres, não daqui.

**Por que sem banner:** pedir consentimento para uma coleta de que não
precisamos seria trocar um passo a mais no fluxo do convidado por nada. Escolher
o modo mais privativo por padrão vale mais que perguntar. O convidado desta
página não tem conta, não escolheu estar ali e não vai ler um modal no meio da
festa.

No fio, com o modo ligado, o hit passa a carregar `gcs=G100`, `npa=1` e
`pscdl=denied`. Antes eram `npa=0` e nenhum `gcs`.

### O que continua indo para o Google, e que alguém pode achar sensível

Honestidade sobre o que **não** foi fechado:

| O quê | Por quê continua | Gravidade |
|---|---|---|
| Endereço IP do convidado | O Google recebe de toda requisição HTTP. Nenhum código nosso controla isso | Inerente a usar GA4 |
| Cabeçalho `origin` no `/g/collect` | É obrigatório em POST entre origens. Em produção ele carrega o domínio do casal | Real. É a única superfície em que o domínio ainda chega ao Google. Some junto com o GA4, e não antes |
| Impressão do aparelho (`sr`, `ul`, `uap`, `uafvl`) | Resolução, idioma, sistema e versão do navegador. Padrão do gtag | Baixa isolada; é fingerprint fraco em conjunto |
| `cid` efêmero | Com `analytics_storage: denied` não vira cookie: é gerado por hit e não persiste | Baixa — e é o que degrada a sessão |
| `wedding_id` | Deliberado. É o inquilino, e é opaco | Nenhuma |

---

## Dicionário

### `page_view` (reservado, automático)

| Campo | Valor |
|---|---|
| Significa | Alguém abriu a página do casamento |
| Onde dispara | `configurarAnalytics()`, em `lib/analytics.ts`, chamado por `components/analytics/GoogleAnalytics.tsx` |
| Parâmetros | os padrões do GA4, mais `wedding_id` vindo do `config`, com `page_location`, `page_title` e `page_referrer` **mascarados** |
| Alimenta | Alcance do convite: quantas pessoas o link atingiu |
| Conversão? | Não |

### `map_opened`

| Campo | Valor |
|---|---|
| Significa | O convidado tocou em "abrir a região no mapa" — está se localizando, provavelmente para decidir hospedagem ou deslocamento |
| Onde dispara | `components/evento/MapaDoLocal.tsx` |
| Parâmetros | `wedding_id` (string, uuid) · `map_precision` (`regiao` \| `exato`) |
| Alimenta | Intenção de ir. É o sinal mais próximo de RSVP que existe antes de haver RSVP |
| Conversão? | Não hoje. Vira conversão se ficar claro que antecede confirmação de presença |

`map_precision` existe para separar o toque em "região" do toque em "endereço":
são intenções diferentes, e misturá-las apagaria o efeito da revelação do local.

### `recommendation_opened`

| Campo | Valor |
|---|---|
| Significa | O convidado abriu o site de um hotel ou de uma dica indicada pelo casal |
| Onde dispara | `components/evento/SecaoIndicacoes.tsx` |
| Parâmetros | `wedding_id` (string, uuid) · `recommendation_kind` (`hospedagem` \| `dica`) · `recommendation_position` (número, a partir de 1) |
| Alimenta | Utilidade da seção de indicações, e se o rodapé da lista é lido |
| Conversão? | Não |

`recommendation_position` responde a pergunta que decide se a seção cresce ou
encolhe: se só o primeiro item é aberto, a lista é longa demais.

**Todo evento carrega também os três campos de página mascarados**, além dos
seus. O `config` já os fixaria para os eventos seguintes, mas isso é
comportamento do gtag, não contrato — e é invisível. Repetir custa três campos
por hit e faz cada evento ser verificável sozinho.

---

## Se este número cair 20%, o que a gente faz?

Métrica que não muda decisão nenhuma não merece dashboard.

| Métrica | Se cair 20% |
|---|---|
| `page_view` por semana | O convite parou de circular — o problema é distribuição, não produto |
| `map_opened` / `page_view` | Ou a região deixou de ser útil, ou a seção "Onde" ficou escondida abaixo da dobra |
| `recommendation_opened` por item | As indicações não servem: trocar os itens, não redesenhar a seção |

Com o consentimento negado, todos estes números são **aproximados**, e a queda
de 20% é gatilho para investigar, não para concluir.

---

## Antes de considerar instrumentado

- [ ] Propriedade criada e `NEXT_PUBLIC_GA_MEASUREMENT_ID` configurado na Vercel
- [ ] `wedding_id`, `map_precision`, `recommendation_kind` e
      `recommendation_position` **registrados** como dimensões personalizadas
- [ ] Cada evento visto disparando no **DebugView** antes de o link ser divulgado
- [ ] No DebugView, conferido que `page_location` começa com
      `https://casa-nos.invalid/e/` e que `page_title` é um caminho, não um nome
- [ ] Confirmado que nenhuma PII sai — verificado, não presumido. O caminho curto
      é rodar `pnpm test test/analytics-sem-pii.test.tsx`; o caminho completo é
      abrir a aba de rede do navegador no preview e ler o `/g/collect`
