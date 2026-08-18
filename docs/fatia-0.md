# Fatia 0 — o que entrou, e o que ficou de fora de propósito

**Data:** 18/08/2026 · **Autor:** dev-fullstack

Este arquivo existe para que nada aqui seja lido como esquecimento. Cada ausência
abaixo é uma decisão, com motivo, e com o lugar onde ela volta.

---

## O que entrou

- Página pública por casamento: hero com os nomes e "save the date", data por
  extenso, contagem regressiva ao vivo, seção "Onde", seção de indicações,
  rodapé.
- Schema multi-inquilino com o evento como raiz, e resolução por domínio ou slug.
- Migrations versionadas e um seed documentado que é o editor de conteúdo de hoje.
- GA4 com dicionário e assinatura tipada.
- As catracas: lint, teste de fumaça, varredura de rota com `[param]`, teste de
  data em `TZ=UTC`, teste de vazamento entre inquilinos, contagem de design system
  dentro do `build`.

---

## O que ficou de fora, e por quê

| Fora | Por quê | Onde volta |
|---|---|---|
| RSVP | Fatia própria, portão próprio | Fatia 2 na estratégia |
| Lista de presentes e checkout | Exige gateway com split, KYC do casal, antifraude e conciliação. Não cabe num dia | Fatia 3 |
| Álbum do convidado, feed, upload | É a aposta central do produto e a fatia mais cara. Construir por antecipação é como esta entrega deixaria de sair hoje | Fatia 1 |
| Autenticação e conta de convidado | O discovery decidiu "nenhuma conta, só o nome". Não há o que autenticar nesta página | Fatia 1, se o álbum exigir |
| Painel administrativo | O seed resolve a edição de hoje com um arquivo e um comando. Um painel para um casal é semanas de trabalho para substituir três minutos de digitação | Fatia 2 |
| Construtor de seções | O dono citou o construtor do iCasei como referência, e ele decidiu que serão **seções fixas com conteúdo editável**, não editor de blocos livre. O schema já reflete isso (tabelas tipadas por seção, colunas reais, zero JSON genérico) | Fatia 2 |
| Modo escuro | Regra §13 do padrão da casa: ou está montado e testado, ou não existe. Meio modo escuro é código morto que parece funcionalidade | Projeto próprio, com os tokens de dark medidos |
| Barra de navegação | Uma página só. Barra fixa rouba altura de tela num hero de celular | Fatia 2, junto com as outras seções |
| Rota de API | A página é renderizada no servidor e não busca nada no cliente. Uma rota de API hoje não teria chamador | Fatia 1 |
| Estado de carregamento (esqueleto) | Sem busca no cliente, não existe nada que possa ficar pendurado. Um `Skeleton` aqui seria enfeite que nunca aparece. **Está escrito porque a ausência precisa ser deliberada, não descoberta** | Junto com a primeira busca no cliente |
| `docs/openapi-*.json` | O contrato é gerado a partir das rotas, e não há rota de API | Junto com a primeira rota |
| Observabilidade de erro | O produto ainda não tem ferramenta de erro. Hoje o que existe é o log da Vercel | Item de roadmap com data, não um "depois" |
| Tabela `evento_secoes` (ligar/desligar e ordenar seções) | Ela é a forma certa quando o editor existir, mas hoje não teria consumidor nem teste. Acrescentar depois é migration aditiva, sem migrar dado | Fatia 2 |

---

## Coisas que o dono precisa decidir ou conferir

| # | O quê | Impacto se ficar como está |
|---|---|---|
| 1 | **A coordenada da região no seed** (`-22.97, -43.37`, raio 4 km). Foi escolhida como centro genérico de Jacarepaguá/Barra, **sem consultar o endereço do local** | O mapa mostra a região errada da cidade |
| 2 | **O nome do local não está no banco.** `localNome` está nulo no seed de propósito: o arquivo mora no repositório, e escrever o nome ali com a flag desligada esconderia da página mas não de quem abre o repositório | Nada quebra. No dia da revelação, preencher o nome e virar a flag |
| 3 | **Horário** | A contagem persegue o começo do dia, e a página diz que o horário ainda falta |
| 4 | **Propriedade do GA4** | Sem `NEXT_PUBLIC_GA_MEASUREMENT_ID` nenhum evento é medido. A página funciona igual |

---

## Uma observação sobre o design system

O documento do `lead-design` prevê `Card` com `iframe` de mapa **e** um botão
"Adicionar à agenda". O botão de agenda **não foi construído**: ele não estava no
recorte da tarefa, e um `.ics` sem horário definido geraria um evento de dia
inteiro que o convidado teria de corrigir à mão depois. Vale construir quando o
horário fechar — aí o arquivo sai certo de primeira.
