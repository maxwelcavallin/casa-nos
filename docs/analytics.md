# Analytics — casa-nos

Ferramenta: **GA4**. Implementação em `lib/analytics.ts` (envio, tipado) e
`components/analytics/GoogleAnalytics.tsx` (carga do script).

**Nenhum evento existe fora deste arquivo.** Evento criado direto no código, sem
entrar aqui, é evento que ninguém sabe o que significa em três meses. A união de
tipos em `lib/analytics.ts` é o que torna a regra executável: nome que não está
lá não compila.

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

---

## Privacidade

**Nenhuma PII.** O convidado desta fatia não tem conta, não se identifica e não
tem nome no sistema. O único identificador enviado é `wedding_id` — o uuid do
evento, que é dado de inquilino, não de pessoa.

Sem `NEXT_PUBLIC_GA_MEASUREMENT_ID` configurado, **nada carrega**: nenhum script,
nenhuma requisição a domínio de terceiro, nenhum cookie. É o estado do projeto
até o dono criar a propriedade — e é melhor que um id inventado, que mandaria os
dados deste casamento para a propriedade de outra pessoa.

---

## Dicionário

### `page_view` (reservado, automático)

| Campo | Valor |
|---|---|
| Significa | Alguém abriu a página do casamento |
| Onde dispara | `gtag('config')`, em `components/analytics/GoogleAnalytics.tsx` |
| Parâmetros | os padrões do GA4, mais `wedding_id` vindo do `config` |
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

---

## Se este número cair 20%, o que a gente faz?

Métrica que não muda decisão nenhuma não merece dashboard.

| Métrica | Se cair 20% |
|---|---|
| `page_view` por semana | O convite parou de circular — o problema é distribuição, não produto |
| `map_opened` / `page_view` | Ou a região deixou de ser útil, ou a seção "Onde" ficou escondida abaixo da dobra |
| `recommendation_opened` por item | As indicações não servem: trocar os itens, não redesenhar a seção |

---

## Antes de considerar instrumentado

- [ ] Propriedade criada e `NEXT_PUBLIC_GA_MEASUREMENT_ID` configurado na Vercel
- [ ] `wedding_id`, `map_precision`, `recommendation_kind` e
      `recommendation_position` **registrados** como dimensões personalizadas
- [ ] Cada evento visto disparando no **DebugView** antes de o link ser divulgado
- [ ] Confirmado no DebugView que nenhuma PII sai — verificado, não presumido
