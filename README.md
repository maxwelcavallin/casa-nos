# casa-nos

Site de casamento multi-inquilino. O primeiro evento é o casamento de Ana Flávia
e Maxwel, em 22 de agosto de 2027, no Rio de Janeiro.

**`casa-nos` é nome de projeto, não marca.** Não há logotipo: o nome do casal é
o elemento gráfico da página, e o nome do produto aparece uma vez, como texto, no
rodapé.

---

## O que existe hoje

> **Leia esta caixa antes de qualquer coisa.**
>
> Esta seção está dividida em **no ar** e **construído e desligado**. A v1.0 é
> *o site do casamento e o painel que o edita*; o álbum, o feed, o telão, a
> moderação, o QR e a lista de convidados **estão construídos, testados e
> desligados por dado** — não apagados.
>
> O interruptor é `eventos.album_ativo` (migration `0014`), e ele nasce `false`.
> Com ele desligado, as ~25 rotas e as 10 telas da Fatia 1 respondem **404**, e
> não 403: 403 confirmaria que existem.
>
> **Como religar**, um casamento de cada vez, sem deploy:
>
> ```sql
> update eventos set album_ativo = true, atualizado_em = now() where slug = 'ana-e-max';
> ```
>
> Duas coisas **não** voltam com o `UPDATE`, e por isso estão escritas aqui:
> o destino da rota curta `/<slug>` (hoje leva ao site; era o álbum) e o link do
> álbum na página pública, que **nunca existiu** e é história nova quando
> existir.
>
> Um README que descreve como pronto o que não responde é o que faz alguém
> "consertar" o guarda seis meses depois.

---

### No ar

**Fatia 0 — a página pública.** Hero com os nomes e "save the date", data por
extenso, contagem regressiva ao vivo, seção "Onde" (cidade, mapa da região, local
e horário pendentes) e rodapé. Mobile primeiro — o visitante chega de um link no
WhatsApp, no celular, com uma mão.

**O painel do site** (`/painel/<id>/site`) — a casa do editor, e o destino do
link do e-mail do casal. Lista as oito seções na ordem atual, com um resumo de
uma linha de cada, marca as que estão **ligadas e vazias**, e liga, desliga e
reordena. Desligar não apaga nada: o conteúdo continua no banco.

**Os editores de três seções** (`/painel/<id>/site/<secao>`): a **capa** (nomes,
data, horário e a flag que decide se o horário é anunciado), **onde e quando** (o
nome do local, a flag que o divulga, e os três níveis de revelação do mapa) e
**onde ficar e dicas** (hotéis e dicas, com link só `http`/`https`, teto de 20 e
exclusão lógica).

**As três seções novas** (migration `0013`): **a nossa história** (título
opcional e 1.200 caracteres de texto puro), **a programação do dia** (até 12
momentos, com horário opcional — nulo significa "sem horário anunciado", e o
site mostra um travessão, nunca `--:--`) e **perguntas frequentes** (até 15
pares; **pergunta sem resposta não aparece no site**, e é isso que permite
sugeri-las sem publicar nada em branco).

**A prévia** (`/painel/<id>/previa`, V-10) — o casal vê o site **como o convidado
vai ver**, antes de ele estar no ar. Ela renderiza o mesmo `PaginaDoEvento` com a
mesma montagem (`lib/site-publico.ts`), e por isso obedece todas as flags sem
escrever nada: horário não publicado não aparece, nome do local não divulgado não
aparece, seção desligada não é nem buscada. A faixa que diz "prévia" é **fixa no
rodapé da janela** — ela não entra na contagem de seções e não empurra o
conteúdo, porque o casal precisa aprovar o primeiro quadro que o convidado vai
receber, e não um deslocado alguns pixels.

Ela **não emite `page_view`**: a prévia é do casal, e oito aberturas numa noite
contaminariam a medição de um site que ainda não tem um único convidado.

**Publicar e tirar do ar** (V-11), no mesmo painel do site. O bloco mostra o
endereço — o domínio do casal quando houver, o `/e/<slug>` da origem atual quando
não —, com botão de copiar. Publicar é um toque; **tirar do ar pede confirmação
que diz a consequência** ("o endereço para de responder: quem abrir o link vai
ver uma página de endereço não encontrado") e diz também que **nada é apagado**.
Publicar emite `site_published` **só na transição** de fora do ar para no ar, e
quem decide isso é a mesma instrução SQL que grava a coluna — dois toques não
geram dois eventos.

> **A emenda da V-19 entrou, e ela é condicional à foto.** Com pelo menos uma
> foto na galeria, a lista do que continua guardado passa a citar **as fotos**, e
> um parágrafo a mais diz a verdade desconfortável: *"a página para de responder,
> mas quem já abriu o site e guardou o endereço de uma foto continua conseguindo
> abrir essa foto. Para tirar uma foto do ar de vez, apague a foto."* Com zero
> foto as duas metades não aparecem — prometer que guardamos o que não existe, e
> avisar sobre endereços que ninguém tem, custaria mais confiança do que a
> ausência. A régua é **por casal**, e não por versão do produto.

Todo texto do casal é **texto puro**: parágrafo é linha em branco, e colar
`<b>oi</b>` do WhatsApp mostra o `<b>oi</b>` escrito. Não existe
`dangerouslySetInnerHTML` em ponto nenhum deste produto — e por isso não existe
sanitização: o que não é interpretado não precisa ser limpo.

**Este é o ponto em que o `db/seed/*.json` deixa de ser necessário** para mudar o
conteúdo do site. Ele continua existindo para o evento **nascer** com conteúdo
inicial — e, desde a V-12, rodá-lo por engano num evento já editado não desfaz
nada: ver [Seed](#seed--é-assim-que-o-evento-nasce-com-conteúdo-inicial).

**A galeria do casal** (migration `0015`, V-18) — a oitava seção, e a única que
escreve no R2 a partir do painel. Em `/painel/<id>/site/galeria` o casal escolhe
uma foto do celular; **o navegador gera as duas derivadas e sobe só elas**, então
os 12 MB do iPhone nunca cruzam a rede. Não há original no balde, e a
consequência que mais importa é de privacidade: **nenhum EXIF chega ao R2,
inclusive o GPS** — o `canvas` re-codifica a partir dos pixels, e pixels não têm
EXIF.

Na página, a galeria é **uma coluna, uma foto por linha, em todos os viewports**,
com **proporção intrínseca** e um teto de altura que encolhe o retrato sem
recortar. Isso não é preferência de layout, e mexer numa metade quebra a outra:
não há lightbox nesta versão, então a foto renderizada é a única que existe — um
tile pequeno seria a promessa de que a foto abre. Pelo mesmo motivo **nenhuma
foto é alvo de toque**, e **nada se desenha por cima dela**. O `alt` é sempre
vazio: o produto nunca inventa texto alternativo, e doze `alt` iguais fazem o
leitor de tela parar doze vezes para não dizer nada. Quem nomeia a região é o
`h2` "Nossas fotos", e uma linha invisível conta quantas fotos entraram.

**A galeria vira galeria** (V-19). No painel, cada foto que já está no site ganha
três coisas: **legenda** de até 80 caracteres (opcional, validada no servidor com
o `CHECK` do banco como segunda tranca; vazia não desenha `<figcaption>` nenhum e
não deixa caixa vazia sob a foto), **ordem** por subir/descer, e **apagar**.

A ordem é **um `PATCH` com a lista inteira**, nunca uma requisição por toque — e
a tela **não trava enquanto salva**, ao contrário do painel de seções. O motivo é
concreto: levar a décima segunda foto ao topo são onze toques, e um botão que não
responde ao segundo toque é lido como defeito. Os toques se **fundem numa fila de
um lugar só**: enquanto um pedido está no ar, o toque seguinte substitui o
pendente. Dois toques rápidos custam um ou dois pedidos, nunca dois concorrentes
que cheguem fora de ordem e gravem o penúltimo estado por último.

O **teto de doze** é validado no servidor, na rota de intenção, e responde **409
com os dois números** — quantas cabem e quantas já existem —, porque um 400 sem
número vira "erro" na tela e "erro" não vira ação nenhuma. A conferência é na
intenção e não na confirmação: recusar depois dos dois `PUT` deixaria objetos no
balde sem linha que os aponte, e não há cron de limpeza.

> **Apagar a foto é a única operação desta versão que apaga byte**, e a ordem dos
> dois passos é o requisito: **o objeto sai de `pub/` primeiro, e só então a
> linha recebe `excluido_em`**. O balde recusando responde **502 com a linha
> intacta** — nunca uma linha que diz "apagada" sobre um arquivo que continua
> respondendo, porque é justamente essa a promessa que a confirmação de tirar o
> site do ar faz. Não há carência de 30 dias como no álbum: o original está no
> celular do casal.

> **A janela que sobra, escrita em vez de descoberta:** entre o arquivo sair do
> balde e a linha ser marcada, o processo pode morrer. Nesse instante o arquivo
> já não existe e a foto ainda está na lista — o site renderiza uma imagem
> quebrada. É a menos ruim das duas janelas (a outra seria a mentira acima) e
> **tem conserto de um toque**: apagar de novo. Apagar um objeto que já não
> existe devolve 404, que o cliente do balde trata como "não está mais lá", e a
> segunda passada chega à linha. A mensagem da tela diz exatamente isso.

**Sair de um editor com alteração não salva avisa** (V-15). Sem alteração, o
"Voltar para o site" é um link e mais nada — aviso que aparece sempre vira
mobília, e a pessoa aprende a atravessá-lo sem ler justamente nas duas vezes em
que ele importava. **No editor da galeria a frase é outra**, e a diferença não é
de tom: com um envio em curso, o que se perde não é o que foi digitado, é a
**foto** — a linha existe sem `armazenada_em`, não renderiza no site, e não há
botão de salvar que resolva. A saída oferecida ali é mandar de novo. Fechar a aba
e recarregar são cobertos pelo `beforeunload` (com a frase do navegador, não a
nossa); **o botão *voltar* do navegador não é interceptado**, e isso está escrito
em `lib/usar-aviso-de-saida.ts` para não ser redescoberto na marra.

**A seção de perguntas oferece as cinco que todo mundo faz** (V-16) — traje,
horário, como chegar, estacionamento e criança — para a seção que **nunca** teve
pergunta. Elas entram sem resposta, e é a regra do V-09 que torna a oferta
segura: pergunta sem resposta não aparece no site. A oferta some no primeiro uso
e **não volta quando o casal apaga todas** — quem decidiu não as querer decidiu
uma vez, e repetir a oferta a cada visita é insistência.

**A contagem de caracteres aparece a 200 do teto** (V-17), e **os campos que a
têm não truncam**: colar do WhatsApp um texto acima do limite mantém o texto
inteiro, a contagem fica vermelha dizendo quantos passaram, e quem recusa é o
servidor — com o número. O `maxLength`, que parece proteção, jogava fora o fim do
texto colado em silêncio.

**As seções do site são dado** (migration `0012`). O catálogo — quais existem,
o nome de cada uma, quais não se desligam — vive em `lib/secoes.ts`, porque cada
seção tem um componente que a desenha. **Linha ausente significa o padrão do
catálogo**: um evento recém-criado renderiza certo sem que ninguém toque no
painel.

---

### Construído e desligado (Fatia 1)

Tudo abaixo **responde 404 hoje**. Os ~115 testes da Fatia 1 continuam rodando,
com `albumAtivo: true` nos fixtures — são eles a prova de que isto funciona no
dia em que voltar. `test/album-desligado.test.ts` é a prova de que não responde
hoje, e ele quebra o CI se alguém desligar o guarda.

**Fatia 1 · F1.1 e F1.2 — o acesso e o caminho da foto.**

- **O casal entra por link de e-mail** (30 minutos, uma vez só) e configura o
  dia: janela de envio, janela da festa, modo de moderação, moderador.
- **O convidado abre `/e/<slug>/album`** e a participação nasce na primeira
  resposta — sem cadastro, sem tela intermediária, sem pedir nada.
- **O botão de mandar não espera nada**: ele não depende de rede em caminho de
  código nenhum.
- **A foto não se perde quando o wifi cai.** A intenção é registrada no servidor
  **antes** dos bytes; a fila local em IndexedDB guarda o arquivo antes de
  qualquer rede, sobe prévia e original em faixas separadas, retenta sem limite e
  retoma sozinha quando o convidado reabre o link.
- **Erro de produção vira linha no banco** e alerta por e-mail ao dono.

**Fatia 1 · F1.3 — a pessoa, e a escolha dela.**

- **A lista de convidados** (`/painel/<id>/convidados`): o casal cola os nomes,
  `Família Silva, 4` vira um slot com quatro pessoas, e as linhas que a máquina
  não entendeu voltam com o motivo. É o denominador da métrica que decide o
  produto.
- **Os dois botões de envio SÃO a escolha de visibilidade**: `Mandar para a
  festa` e `Mandar só para os noivos`, com a mesma altura, a mesma largura e
  nenhum empurrão visual — a razão entre os cliques é o instrumento da hipótese
  central.
- **O nome é perguntado depois**, com o envio já correndo, e pode ser ignorado.
  A busca é local: funciona sem rede.
- **O envio termina em "as minhas fotos"** (`/e/<slug>/album/minhas`), onde cada
  foto responde a duas perguntas ao mesmo tempo — *quem vê isso?* e *já chegou?*
  — e a visibilidade volta atrás sem prazo.

**Fatia 1 · F1.4 — a prova pública.**

- **O feed da festa**, com rajada agrupada num cartão, paginação por cursor e
  sondagem barata a cada 5 s **só com a aba visível**. Novidade não empurra a
  tela: aparece um botão no topo.
- **O código para imprimir** (`/painel/<id>/materiais`): três formatos, com a
  origem por superfície (`?o=mesa`, `?o=cartaz`, `?o=telao`), gerados por um
  codificador de QR próprio e verificado contra os valores publicados da
  especificação.
- **O telão** (`/telao/<token>`): abre por link próprio, roda em silêncio, e
  **nunca projeta um erro na parede**. Perdeu a rede, perdeu o servidor: ele
  continua com o que já tem.

**Fatia 1 · F1.5 a F1.7 — o controle, a verdade e o loop. A fatia fecha aqui.**

- **A fila de aprovação** (`/painel/<id>/fila`) segura o feed e o telão, **nunca
  o acervo do casal**: com a moderação ligada, a foto é gravada, contada e fica
  com o casal na hora. "Aprovar as 400" é um toque e uma requisição.
- **O que chegou** (`/painel/<id>/midias`): `6.000 fotos, 5.412 em alta
  resolução` — dois números, nunca somados. Falha de leitura mostra um travessão
  e o motivo, **nunca um zero**.
- **A reconciliação** adota a foto cujos bytes chegaram e cuja confirmação se
  perdeu — quando o convidado reabre o álbum, e num cron diário às 12:00 UTC. A
  perda irrecuperável é uma consulta, e o valor esperado é **zero**.
- **O painel do dia** (`/painel/<id>/dia-ao-vivo`, **só o dono**): sete números,
  um por linha, atualizando a cada minuto, direto do Postgres. Inclui o sinal do
  telão — a única forma de descobrir que a parede congelou.
- **O CTA do loop** e o **link guardado**, abaixo da grade de "as minhas fotos" e
  só depois do primeiro envio concluído. O lead é gravado com a festa de origem
  **no servidor**, porque o loop não fecha por cookie.
- **Baixar a foto**, por URL assinada de 15 minutos, dizendo qual versão está
  baixando.
- **Toda foto `noivos` sai por URL assinada** (RN-33): `pub/` é servido, `prv/`
  não. Trocar uma foto para `noivos` **move os objetos de prefixo**, e a troca só
  é confirmada depois de o endereço público parar de responder — inclusive na
  borda.

**A tela do dia** (`/painel/<id>/dia`) também está desligada: ela configura a
janela de envio e a moderação, que são da Fatia 1. A ação dela deixou de ser
`evento.configurar` e passou a ser **`dia.configurar`** — a primeira ficou sendo
só "esta sessão é o casal deste evento", e é o que mantém o login funcionando
com o álbum desligado.

**A reconciliação continua agendada** (`vercel.json`, 12:00 UTC) e **não** foi
removida: cron que some do arquivo volta esquecido. A consulta dela ganhou
`and album_ativo`, então ela varre zero eventos e termina sem trabalho.

**O relato de erro do cliente continua ligado** (`/api/interno/erro-cliente`).
É observabilidade, e o site também falha.

O que **não** existe, de propósito, está em
[`docs/fatia-0.md`](docs/fatia-0.md), em
[`docs/fatia-1-f1-1-f1-2.md`](docs/fatia-1-f1-1-f1-2.md), em
[`docs/fatia-1-f1-3-f1-4.md`](docs/fatia-1-f1-3-f1-4.md) e em
[`docs/fatia-1-f1-5-f1-7.md`](docs/fatia-1-f1-5-f1-7.md).

---

## Stack

Next.js 16 (App Router) · TypeScript · MUI · Tailwind **só para layout** · Neon
Postgres com migrations SQL versionadas · GA4 · Vercel.

---

## Como rodar

```bash
pnpm install
cp .env.example .env.local      # e preencha os valores
pnpm db:migrar                  # cria o schema
pnpm db:seed                    # grava o conteúdo do casamento
pnpm dev                        # http://localhost:3000
```

Sem `DATABASE_URL` o servidor sobe, mas toda página responde 500 com a mensagem
`DATABASE_URL não configurada`. É o comportamento certo: um site de casamento sem
banco não tem o que mostrar, e falhar em silêncio seria pior.

Em `localhost` o domínio não bate com nenhum cadastro, então o evento vem de
`EVENTO_SLUG_PADRAO` (use `ana-e-max`). Sem essa variável, `/` responde 404 e
`/e/ana-e-max` continua funcionando.

### O caminho inteiro, na ordem em que ele acontece

> **Este roteiro é da Fatia 1, e ela está desligada.** Com `album_ativo = false`
> (o padrão desde a migration `0014`), os passos abaixo respondem 404. Para
> percorrê-los, ligue o álbum no evento de teste primeiro:
>
> ```sql
> update eventos set album_ativo = true where slug = 'casamento-de-teste';
> ```

Com o servidor no ar e o cookie de acesso do casal em mãos (ver
[Bootstrap](#bootstrap--é-assim-que-um-evento-nasce)):

| # | Onde | O que conferir |
|---|---|---|
| 1 | `/painel/<eventoId>/convidados` | Cole `Ana Paula Ribeiro`, `Família Silva, 4`, `, 4` e `Casal Lima, 2 pessoas`. **Duas linhas entram, duas voltam com o motivo** e o texto delas continua na caixa. Cole a mesma lista de novo: nada duplica |
| 2 | `/painel/<eventoId>/materiais` | Baixe os três. Abra o `.svg` e **leia o código com a câmera do celular** — é o critério de aceite da H-04, e ele é humano. Gere o **link do telão** e guarde: ele aparece uma vez |
| 3 | `/telao/<token>` | Abre direto na arte do vazio: nome, QR grande, "Aponte a câmera". **Nunca branco, nunca logo girando** |
| 4 | `/e/ana-e-max/album` | O botão de mandar está lá antes de o feed carregar. Escolha fotos: a folha abre com **os dois botões**, do mesmo tamanho |
| 5 | ainda no passo 4 | Toque em um dos dois. Você cai em `/e/ana-e-max/album/minhas` **com a pergunta do nome já aberta**, e o envio correndo por baixo |
| 6 | `/e/ana-e-max/album/minhas` | Cada foto tem o selo de **quem vê** (canto inferior esquerdo) e, enquanto sobe, o de **já chegou** (canto superior direito). Toque numa foto → `Mudar quem vê` |
| 7 | de volta ao telão | A foto aparece na parede em até 15 s, com fusão de 600 ms |
| 8 | ainda no passo 6 | Tire a foto do feed (`Só para os noivos`). Ela some da parede na sondagem seguinte |

**Para ver os estados que dependem de data**, mexa na janela em
`/painel/<eventoId>/dia`:

- janela **abrindo amanhã** → o álbum mostra `Você chegou antes da festa`, com a
  data, e **sem botão de mandar**;
- janela **já fechada** → `Os envios deste casamento foram encerrados.`, também
  sem botão. O feed continua visível nos dois.

**Para ver o telão sem rede:** abra o `/telao/<token>`, deixe algumas fotos
entrarem no buffer e desligue o wifi. Ele **continua girando as fotos que já
tem**, sem nenhum aviso — que é a especificação, e é a parte difícil de acreditar
sem ver.

---

## Variáveis de ambiente

Os **nomes** estão em [`.env.example`](.env.example), com o que cada uma faz.
Valor não entra no repositório — nem exemplo, nem truncado. Eles vivem só no
painel da Vercel e no do Neon.

| Nome | Obrigatória | Sem ela |
|---|---|---|
| `DATABASE_URL` | sim | toda página responde 500 |
| `EVENTO_SLUG_PADRAO` | só fora de produção | `/` responde 404 em localhost e no preview |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | não | o GA4 não carrega — nenhum script, nenhum cookie |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | para o envio | as duas superfícies respondem 503, e fazem coisas **diferentes** com a linha: no **álbum** a intenção fica gravada (perdê-la é perder a foto do convidado, e a reconciliação a procura); na **galeria nenhuma linha nasce** — não há reconciliação, o original está no celular do casal, e gravar produziria lixo que nenhum cron limpa |
| `R2_PUBLIC_BASE` | **sim, para quem publica site com galeria** | a galeria não funciona e **não quebra nada**: o envio responde 503 e a tela avisa **antes** de a pessoa escolher o arquivo, e nenhuma foto renderiza — sem imagem quebrada na página, porque foto sem endereço público é descartada no recorte. O resto do site continua no ar. (No álbum, que está desligado, ela era opcional: a grade renderizava os tiles sem imagem.) Ver [ADR 0005](docs/adr/0005-leitura-de-midia-por-base-publica.md) |
| `BREVO_API_KEY`, `BREVO_REMETENTE` | para o link do casal | nenhum e-mail sai; a tela não mente dizendo que mandou. Entre pelo cookie que o bootstrap imprime |
| `ALERTA_EMAIL` | não | o alerta de taxa de erro não sai; o registro em `eventos_de_erro` continua |
| `CRON_SEGREDO` | F1.6 | a sessão de cron nunca é reconhecida — o lado seguro de errar |

---

## Banco

### Migrations

```bash
pnpm db:migrar            # aplica o que falta
pnpm db:migrar --status   # lista sem aplicar
```

- Arquivos em `db/migrations/`, numerados, aplicados em ordem, uma vez cada
  (controle na tabela `_migracoes`).
- **Migration aplicada é imutável.** Corrigir é escrever a próxima.
- **DDL na mão no console é proibida.** No instante em que alguém roda um `ALTER
  TABLE` no painel do Neon, o schema de produção vira algo que só o banco conhece
  e nenhum ambiente novo consegue mais ser reconstruído.
- Toda instrução é idempotente (`create ... if not exists`). O motivo é o driver:
  o Neon por HTTP executa uma instrução por requisição, sem transação em volta do
  arquivo. Se a quinta falhar, as quatro primeiras ficaram — e idempotente
  significa que consertar e rodar de novo é seguro.

A migration `0001` foi executada contra um Postgres real, duas vezes seguidas,
para provar que roda e que é idempotente.

> **A `0014` NÃO É ADITIVA INOFENSIVA.** Ela acrescenta uma coluna com default
> `false`, e o efeito é **tirar o álbum do ar** em todos os eventos. É o
> comportamento pretendido pela v1.0, e está escrito no cabeçalho do próprio
> arquivo. Ver a caixa em [O que existe hoje](#o-que-existe-hoje).

**A numeração pula de `0007` para `0010`, e é de propósito.** O PRD reserva a
`0008` às views de medição (§5.7) e a `0009` a `leads` (§5.8) — as duas são das
sub-fatias F1.6 e F1.7, e estão escritas lá com esses números. A tabela de erro
da H-18 entrou como `0010` para não tomar o número de ninguém. O runner ordena
por nome; buraco na sequência não quebra nada.

### Bootstrap — é assim que um evento nasce

Não existe cadastro público na Fatia 1 (decisão P4 do PRD): não há página de
aquisição, e a estratégia proíbe vender ao segundo casal antes do primeiro
casamento. O evento nasce por script, e o casal entra por link.

```bash
pnpm db:bootstrap db/seed/casamento-ana-e-max.json --dono
pnpm db:bootstrap db/seed/casamento-de-teste.json
```

**Rode os dois.** O segundo evento não é enfeite: o teste de vazamento entre
inquilinos é critério de término da fatia, e ele é invisível com um inquilino só.
Acrescentar o segundo depois significa auditar cada consulta escrita até ali.

O script imprime **uma vez** o valor do cookie de acesso do casal — no banco só
existe o hash. Se o `email_casal` estiver preenchido, o caminho normal é pedir o
link na tela de entrada, que manda por e-mail (Brevo).

`--dono` marca o acesso do dono do produto, que é quem enxerga a medição. No
casamento cobaia o dono **é** o casal; no evento de teste, ninguém é dono.

### Seed — é assim que o evento nasce com conteúdo inicial

**O seed não é o editor do site.** Quem edita o site é o painel, em
`/painel/<id>/site`, desde a V1.3. Este comando serve para o evento **nascer**
com conteúdo — e, desde a V-12, para poder ser rodado por engano num evento já
editado sem desfazer nada.

```bash
pnpm db:seed
```

A regra é uma só: **semeia o que está vazio, mantém o que está preenchido, nunca
apaga.** A saída diz, uma linha por campo, o que ele fez com cada um, e termina
com o número dos dois lados.

```
  ana-e-max: evento já existe — só o que estiver vazio é semeado
    nome_casal             mantido   (ja preenchido no banco — o painel manda)
    hora_evento            semeado   (estava vazio no banco)
    publicado              mantido   (decisao do painel: false e 'oculto' sao valores, nao vazios)
    Hotel do Arquivo       mantido   (ja existe neste evento)
    1 semeado(s), 14 mantido(s). Nao toca em: evento_secoes, evento_historia,
    evento_programacao, evento_perguntas, evento_fotos.
```

**Três classes de campo, e a terceira é a que evita o estrago:**

| Classe | Quais | O que o seed faz num evento que já existe |
|---|---|---|
| Aceita nulo | `horaEvento`, `localNome`, `localEndereco`, coordenadas, raio | preenche **se, e só se,** a coluna estiver nula ou em branco |
| Obrigatório | `nomeCasal`, `dataEvento`, `cidade`, `uf` | mantém — no banco eles nunca estão vazios |
| **Decisão** | `publicado`, `horaPublicada`, `localNomePublicado`, `localRevelacao`, `fuso` | **nunca escreve.** `false` não é "faltando" e `'oculto'` não é "em branco": são os valores que o painel grava quando o casal decide não divulgar. Um seed que os "corrigisse" pelo JSON **republicaria um site que o casal tirou do ar** |

As **indicações** deixaram de ser reescritas em bloco. A chave é o título (sem
caixa e sem espaço nas pontas): o que está no arquivo e não no banco é inserido,
o resto fica de pé. **Tirar um hotel do JSON não tira mais o hotel do site** —
quem tira é o painel. Era o comportamento antigo, e ele custava apagar, a cada
rodada, tudo que o casal tivesse acrescentado por lá.

O seed **não lê, não escreve e não exclui** `evento_secoes`, `evento_historia`,
`evento_programacao`, `evento_perguntas` e `evento_fotos` — e o comando nomeia as
cinco na saída. `evento_fotos` está fora por um motivo mais duro que os outros
quatro: foto é binário que vive num balde, e um seed que subisse objeto para o R2
seria um **segundo montador de chave**, exatamente o que
`test/r2-prefixos.test.ts` existe para impedir. Por isso o JSON também não ganha
campo de foto — nem agora, nem depois.

Ele continua conferindo o arquivo **antes** de tocar no banco: data em formato
brasileiro, horário publicado sem horário preenchido, nome de local publicado sem
nome, coordenada faltando — cada um vira uma mensagem que diz o que corrigir, em
vez de um erro de constraint no meio da escrita.

Quem decide campo a campo é `scripts/seed-plano.mjs`, que é puro e tem catraca
própria em `test/seed-plano.test.ts` — inclusive a que prova que a **segunda**
rodada não escreve coluna nenhuma, nem para gravar os mesmos bytes.

**O que ainda se muda pelo JSON, e o que não se muda mais:**

| Para | Onde |
|---|---|
| Criar um evento novo com conteúdo inicial | o JSON + `pnpm db:seed` |
| Preencher um campo que ainda está vazio (horário, nome do local, endereço) | o JSON + `pnpm db:seed`, ou o painel |
| Acrescentar hotéis e dicas que ainda não existem | o JSON + `pnpm db:seed`, ou o painel |
| **Corrigir** qualquer campo já preenchido | **o painel** — o seed mantém o que está lá |
| **Tirar** um hotel ou uma dica | **o painel** — o seed nunca exclui |
| Divulgar o horário, revelar o local, publicar ou tirar do ar | **o painel** — são decisões, e o seed não as escreve |

---

## Multi-inquilino

**O evento é o inquilino.** Não existe "o site do casamento da Ana e do Maxwel"
no código: existe um produto de casamentos cujo primeiro inquilino é o deles.

```
eventos                 ← a raiz
├── evento_dominios     ← anaemax.com.br  →  qual casamento
└── evento_indicacoes   ← hospedagem e dicas, com evento_id
```

A requisição vira inquilino em `lib/resolver-evento.ts`, nesta ordem: **domínio**
(produção) → **`EVENTO_SLUG_PADRAO`** (localhost e preview) → **404**. Domínio
desconhecido nunca cai no "primeiro casamento da lista" — é assim que um produto
multi-inquilino mostra o casamento errado para o convidado errado.

Um segundo casal entra com dois `INSERT` (um em `eventos`, um em
`evento_dominios`) e o domínio apontado. **Sem migration e sem deploy.**

Toda consulta filtra por `evento_id` no servidor, nunca por id vindo do cliente.
`test/eventos-escopo.test.ts` roda com dois casamentos e prova que um não lê o
outro — o teste tem dois inquilinos desde a primeira linha porque vazamento entre
inquilinos é invisível em teste com um só.

---

## O mapa, e por que ele não tem pin

O casal quer **o mapa visível e o nome do local escondido**. São duas decisões
independentes e por isso são dois campos com flags separadas.

`eventos.local_revelacao` tem três valores:

| Valor | O que a página mostra |
|---|---|
| `oculto` | só a cidade e "o local entra aqui assim que for definido" |
| `regiao` | mapa afastado com a **área** destacada, **sem marcador**, sem endereço |
| `exato` | pin, endereço e link de rotas |

Hoje vale `regiao`. O ponto guardado no banco é o **centro aproximado de uma área
de 4 km**, não o endereço — de propósito, para que nem o código-fonte da página
nem o link do mapa permitam inferir o estabelecimento. O mesmo componente desenha
os três estados: revelar é um `UPDATE`.

**Mapa sem chave de API**, montado com tiles do OpenStreetMap (`lib/mapa.ts`).
Não é só custo: uma chave do Google Maps num site público é uma chave exposta,
com cota que qualquer um pode gastar.

As tiles e a área destacada penduram na **mesma âncora** (o ponto central, em
50%/50% do contêiner), então a área fica centrada no ponto guardado em qualquer
largura de tela — por construção, e não por ajuste. `test/mapa.test.ts` prova a
aritmética; a conferência no navegador cobre o resto.

A primeira versão usava o iframe de embed do OSM e **errava o alvo em cerca de
2 km**, diferente em cada largura de tela, porque o embed reserva parte da
própria altura para a barra de atribuição. O ADR 0002 conta a história inteira e
por que nenhum recorte do iframe resolvia.

O crédito da licença é texto nosso, abaixo do mapa, com link vivo — dentro do
embed ele existia com os links mortos.

> **Confira o ponto.** A coordenada no seed (`-22.97, -43.37`, região
> Jacarepaguá/Barra) foi escolhida como centro genérico da região, sem consultar
> o endereço do local. Se a região estiver errada, **corrija no painel**: as
> coordenadas já estão no banco, e desde a V-12 o seed não sobrescreve campo
> preenchido.

---

## Verificação

```bash
pnpm verificar    # tsc --noEmit && eslint && vitest run && ds-check && contrato
```

Um comando só, porque verificação que exige lembrar de rodar três comandos vira
verificação que ninguém roda. Ele roda no CI e deve rodar no hook de pré-commit.

**O que ele cobre:**

| Catraca | O que segura |
|---|---|
| `tsc --noEmit` | tipos, incluindo os nomes de evento do GA4 (evento inexistente não compila) |
| ESLint | `#hex`/`rgb()` em `app/` e `components/`; import de `components/ui`; `any`; **`dangerouslySetInnerHTML` em `app/` e `components/`** (V-14 — o produto é texto puro, e por isso não sanitiza nada: uma tela que interpretasse HTML transformaria essa coerência num buraco) |
| `test/rotas.smoke.test.tsx` | toda página carrega e a página monta nos estados que tem |
| `test/rotas-id-validado.test.ts` | toda rota com `[param]` valida o formato **antes** de consultar — e, desde a V-14, **cada parâmetro pelo verificador do próprio tipo**: `[secao]` por `ehChaveDeSecao`, não pelo `ehUuid` do `[eventoId]` que está ao lado |
| `test/eventos-escopo.test.ts` | inquilino A não lê o B; o que o casal escondeu não sai do servidor |
| `test/datas.test.ts` | data e fuso, **rodando com `TZ=UTC`** |
| `test/sql-instrucoes.test.ts` | o separador de instruções do runner de migration |
| `test/pagina-com-dados-do-seed.test.tsx` | o conteúdo real, do arquivo de seed até o texto na tela |
| `test/mapa.test.ts` | a área do mapa cai sobre o ponto guardado, em qualquer largura |
| `test/design-system.test.ts` | mede o código de hoje **e** prova que a catraca ainda acusa desvio |
| `test/analytics-sem-pii.test.tsx` | monta a página, aciona os eventos e varre **o que saiu** para o GA4 atrás do nome do casal |
| `test/analytics-privacidade.test.ts` | o mascaramento de URL, inclusive nas rotas que ainda não existem |
| `test/analytics-gtag-unico.test.ts` | ninguém fala com o `gtag` fora de `lib/analytics.ts` |
| `scripts/ds-check.mjs` (no `build`) | contagem de desvios de design system; falha se subir |
| `test/intencao-antes-dos-bytes.test.ts` | **a linha de intenção existe antes de a URL ser assinada** — e continua existindo se a assinatura falhar |
| `test/fila-motor.test.ts` | o salão dentro do CI: modo avião, portal cativo, 500, URL vencida, retomada |
| `test/fila-maquina.test.ts` | recuo com teto, classificação de falha, ordem das faixas |
| `test/janela-de-envio.test.ts` + `.brasilia.test.ts` | a mesma janela em `TZ=UTC` **e** em `TZ=America/Sao_Paulo` |
| `test/autorizacao-matriz.test.ts` | `cookies()` num arquivo só; nenhum `if` de perfil em rota; toda rota na matriz |
| `test/vazamento-inquilinos.test.ts` | inquilino A não lê o B, agora com participação, acesso e mídia |
| `test/analytics-mascara-rotas.test.ts` | nenhuma rota manda identificador legível ao GA4 — inclusive as que ainda não existem |
| `test/r2-assinatura.test.ts` | o layout das chaves no R2 (mudar depois é migração de blob) |
| `test/observabilidade-sem-pii.test.ts` | o registro de erro não guarda nome, e-mail nem telefone |
| `test/telas-fatia-1.smoke.test.tsx` | as telas da F1.1 e da F1.2 montadas, com o texto exato e o atalho de teclado |
| `test/qr.test.ts` | o codificador de QR contra os valores publicados da especificação, **e o caminho de volta**: a matriz é lida e o que sai é o que entrou |
| `test/convidados.test.ts` | a caixa de colar: a vírgula da direita, as linhas recusadas, o teto de 300, a reimportação que não duplica |
| `test/minhas-e-visibilidade.test.ts` | as duas perguntas em campos separados; **um** caminho de escrita para `midias.visibilidade`; palavra terminal e os dois tetos de caracteres |
| `test/feed.test.ts` | os quatro filtros do feed, o telão com o **mesmo** recorte, o agrupamento no banco e o cursor |
| `test/telao.test.ts` | cinco variantes e nenhuma a mais, cores de estado desligadas, o palco pintando o próprio chão, e as nove proibições da parede varridas no código |
| `test/medida-do-dia.test.ts` + `.brasilia.test.ts` | `days_since_event` e a data anunciada, nos **dois** fusos |
| `test/telas-f1-3-f1-4.smoke.test.tsx` | as quatro telas novas montadas, com o texto exato do `gtm.md` |
| `test/openapi.test.ts` | o contrato gerado bate com `lib/rotas.ts` |
| `pnpm contrato` (no `build`) | `docs/openapi-casa-nos.json` regenerado no mesmo commit da rota |
| `test/visibilidade-move-objetos.test.ts` | **a foto que vira `noivos` sai de `pub/`** — a ordem dos quatro passos, e a troca falhando inteira quando a borda ainda responde |
| `test/r2-assinatura.test.ts` | os dois prefixos do balde; a URL de `noivos` **nunca** contém o domínio público; sem R2 ela é `null`, e não a pública |
| `test/rota-curta.test.ts` | **toda pasta de primeiro nível de `app/` está reservada** — uma pasta nova rouba, em silêncio, o endereço de um casamento já impresso |
| `test/moderacao.test.ts` | a fila filtra `feed`, aprova em lote numa instrução, e o álbum do convidado não conhece a palavra "aprovação" |
| `test/leads.test.ts` | a origem do lead vem da URL e nunca do corpo; o WhatsApp não sai para o GA4; `cta_surface = feed` não é emitido |
| `test/reconciliacao.test.ts` | a adoção usa a data do OBJETO, é idempotente, e original sem prévia vira marca — não perda |
| `test/analytics-dicionario.test.ts` | a união tem exatamente os 16 eventos da Fatia 1 mais `site_published`, todos documentados, e **nenhum parâmetro aceita texto livre** |
| `test/medicao.test.ts` + `.brasilia.test.ts` | as sete linhas nos dois fusos; `numeric` vira número na fronteira; a linha que falha não derruba as outras seis |
| `test/telas-f1-5-f1-7.smoke.test.tsx` | fila, painel e dia ao vivo montados, com o texto exato — e o CTA **não existindo** antes do primeiro envio |
| `test/contadores-vs-verdade.test.ts` | **banco real**: o agregado do casal contra `count(*)` depois de centenas de operações |
| `test/perda-vs-verdade.test.ts` | **banco real**: a consulta de perda diz 0 hoje e diz 3 depois de D+7 — a prova de que ela não está cega |
| `test/previa.test.ts` | a prévia funciona **sem `publicado`**, obedece as flags, e o conteúdo de seção desligada não é nem buscado |
| `test/site-secoes.test.tsx` | **nenhuma das três telas do site remonta o conteúdo por conta própria**, e só a prévia desliga a medição |
| `test/publicacao.test.ts` | dois toques não geram dois eventos; tirar do ar não apaga nada; o casamento A não publica o B; a frase da confirmação está escrita |
| `test/r2-prefixos.test.ts` | **exatamente duas** funções sabem montar caminho no balde, e a terceira quebra o CI |
| `test/galeria.test.ts` | as **cinco recusas de medida** (RV-26), o recorte público, e as fotos de um casamento não vazando para o outro |
| `test/galeria-secao.test.tsx` | `alt` sempre vazio; `<figcaption>` só quando há legenda; **nada se sobrepõe à foto**; e os catorze itens proibidos da galeria varridos no código |
| `test/vazamento-galeria.test.ts` | toda instrução SQL sobre `evento_fotos` cita `evento_id`, e nenhuma rota monta SQL por conta própria |
| `test/album-desligado.test.ts` (asserção inversa) | **as rotas da galeria respondem com `album_ativo = false`** — a semelhança entre álbum e galeria é o que mais convida a violar isso |
| `test/saude.test.ts` | a rota de saúde exige o segredo, e a falha vira linha em `eventos_de_erro` |
| `test/galeria-v19.test.ts` | a legenda (80, texto puro, espaço normalizado antes de medir); a ordem recusada **inteira** quando um item é ruim; e as duas derivadas saindo do balde — **a miniatura antes da prévia**, e o balde recusando não apagando nada |
| `test/galeria-exclusao-rota.test.ts` | **quando a linha é marcada, o objeto já saiu** — a asserção é sobre o estado do banco no instante em que o R2 é chamado, não sobre a ordem das linhas no arquivo. Mais o 502 com a linha viva, e o **409 com os dois números** na décima terceira foto |
| `test/galeria-editor.test.tsx` | dois toques rápidos em subir/descer: a lista move na hora, **um** pedido no ar, e o último descreve a tela. Mais a legenda salvando por botão e a caixa de apagar dizendo a consequência |
| `test/seed-plano.test.ts` | **o segundo `pnpm db:seed` não escreve coluna nenhuma** — e o seed não republica um site que o casal tirou do ar, nem reinsere indicação que já existe |
| `test/aviso-de-saida.test.tsx` | o aviso não aparece sem alteração; aparece com texto digitado; e **no envio em curso a frase é outra**, porque a perda é outra |
| `test/perguntas-sugeridas.test.ts` | as cinco nascem invisíveis, entram num `unnest` só, e **a consulta que decide a oferta não filtra `excluido_em`** — a ausência é a funcionalidade |
| `test/perguntas-oferta.test.tsx` | a oferta aparece só na seção que nunca teve pergunta, e não volta depois que o casal apagou todas |
| `test/perguntas-lote-rota.test.ts` | o teto conferido **contra o tamanho do lote** — com 12 gravadas, as cinco são recusadas com 409 e nada é inserido |
| `test/contagem-de-caracteres.test.tsx` | a contagem só perto do teto, e **`maxLength` ausente pelo nome do atributo** — é a primeira coisa que alguém repõe "para proteger o campo" |

**O que ele NÃO cobre, e nenhum comando cobre:**

- **Layout.** Uma página que renderiza inteira torta passa em verde. Verificação
  de pixel exige navegador, e não existe substituto honesto — quem resolve isso é
  o olho humano no preview.
- **Usabilidade e clareza do texto.**
- **A viagem até o Neon.** Quase todo o caminho de dados é testado com um banco
  falso que imita os tipos que o Postgres devolve (`numeric` como string, `date`
  como texto). **Duas exceções, e elas rodam contra o banco de verdade quando há
  `DATABASE_URL`:** `contadores-vs-verdade` (o agregado do casal) e
  `perda-vs-verdade` (a consulta que decide a fatia). Sem a variável, as duas se
  pulam sozinhas e dizem isso — fingir que passaram seria pior.
- **O balde.** Sem credencial de R2 não há objeto para copiar nem endereço para
  conferir. A coreografia da RN-33 é verificada por uma porta
  (`ClienteDeObjetos`) com um balde falso: a **ordem** dos passos e a recusa
  quando a borda não confirma são provadas; que o domínio público esteja
  configurado só no prefixo `pub/` é configuração, e está escrita no
  `.env.example`.

  > **E hoje isso não é hipótese.** As cinco variáveis do R2 **não estão
  > configuradas em produção**, e é infraestrutura, não código. O caminho
  > exercitado de verdade lá foi o de degradação: doze tentativas de envio
  > responderam 503, a tela avisou item a item com botão de tentar de novo, e o
  > rodapé continuou honesto em *"0 fotos no site. Cabem 12."* **O caminho feliz
  > nunca rodou fora de teste** — nenhuma foto subiu, e portanto nenhuma foi
  > apagada. Enquanto o balde não existir, `galeria-v19` e `galeria-exclusao-rota`
  > são a única coisa que separa a promessa da esperança.
- **Escala.** `pnpm verificar` não sobe 200 clientes. Quem faz isso é
  `pnpm carga`, e o resultado está em
  [`docs/carga-fatia-1.md`](docs/carga-fatia-1.md).

A catraca do design system nasceu com todos os números em **zero**. Ela está em
modo contagem (falha se subir), que na prática já é proibição — não aumente o
teto em `design-system.baseline.json` sem o motivo escrito na mensagem do commit.

---

## Deploy

1. Projeto novo na Vercel apontando para este repositório.
2. Variáveis de ambiente no painel: `DATABASE_URL` e
   `NEXT_PUBLIC_GA_MEASUREMENT_ID`. **Não** configure `EVENTO_SLUG_PADRAO` em
   produção — lá quem resolve o inquilino é o domínio.
3. Banco Neon criado e `pnpm db:migrar` + `pnpm db:seed` executados uma vez
   (com a `DATABASE_URL` de produção no `.env.local` local, ou por um job).
4. Domínio `anaemax.com.br` adicionado ao projeto na Vercel, com o DNS apontado.
5. A linha em `evento_dominios` já cadastra `anaemax.com.br` pelo seed. Se o
   domínio final for outro, acrescente em `dominios` no JSON e rode o seed.

O `build` roda `ds-check` antes do `next build`: desvio de design system não faz
deploy.

> ### O estado de produção em 19/08/2026 — conferido, não presumido
>
> A v1.0 está **inteira em código** e no ar. **Duas coisas dela dependem de
> configuração que não existe hoje**, e nenhuma das duas é defeito de código:
>
> | O que | Como está | O que falta |
> |---|---|---|
> | **As cinco variáveis do R2** | ausentes | Sem elas a galeria **não funciona**: o envio responde 503 e a tela desabilita o botão com o motivo escrito, **antes** de a pessoa escolher o arquivo. O resto do site continua no ar. É o único caminho da v1.0 que nenhum teste pode fechar — sem balde, nenhuma foto subiu e nenhuma foi apagada |
> | **`anaemax.com.br`** | **o DNS não resolve** | O painel mostra esse endereço como *"o endereço de vocês"*, com botão de copiar, porque a linha existe em `evento_dominios`. **Enquanto o domínio não apontar, esse botão copia um link morto.** Ou o domínio é registrado e apontado (passo 4 acima), ou a linha sai de `evento_dominios` e o painel volta a mostrar `/e/ana-e-max`, que responde 200 hoje |
>
> `casa-nos.vercel.app/` responder **404** é o comportamento correto e não é
> ausência: em produção quem resolve o inquilino é o domínio, e `/e/ana-e-max`
> responde 200.
>
> **O que foi conferido no ar, a 360 px:** a página pública, as seis telas de
> editor, a prévia e o painel do site — nenhuma delas com rolagem horizontal nem
> elemento mais largo que a tela. E `pnpm db:seed` rodado contra o banco de
> produção: **0 semeados, 31 mantidos, nenhuma escrita** (V-12).

**O cron da reconciliação está em `vercel.json`: `0 12 * * *`, que é 12:00 UTC /
9h de Brasília.** O horário obedece à regra da casa (job que fala com API de terceiro
roda entre 12 e 20 UTC) e evita o único horário proibido de verdade: um cron às
3h UTC rodaria à meia-noite de Brasília, no meio de uma festa, quando as escritas
do produto estão no pico.

Configure `CRON_SEGREDO` na Vercel **e** como `CRON_SECRET` do projeto: o
agendador chama por `GET` com `Authorization: Bearer`, e a rota aceita as duas
formas. **Sem o segredo configurado, a rota responde 401** — nunca "passa porque
a variável está vazia".

**O que ainda não existe, e está declarado:** um vigia que avise quando o cron
*não* rodar. Um processo não consegue avisar que não rodou. O que existe no lugar
é evidência onde uma pessoa olha — `evento_contadores.recomputado_em` viaja no
painel do dia ao vivo, ao lado do sinal do telão. Um vigia de verdade é um
serviço externo batendo numa rota, e é configuração.

### A rota de saúde — `GET /api/interno/saude`

**Segunda entrada do cron: `30 13 * * *`** (13:30 UTC / 10:30 de Brasília), com
o mesmo `CRON_SEGREDO`. Espaçada da reconciliação de propósito: as duas na mesma
hora disputam a partida a frio e transformam duas leituras baratas numa janela
ruim.

**O que ela existe para pegar, com nome e número:** a `DATABASE_URL` ficou vazia
por **seis deploys**, e a plataforma mostrou READY nos seis. O `next build`
compila sem tocar no banco — o cliente Neon é preguiçoso justamente para isso —,
então o build passa, o deploy sobe, o painel fica verde, e toda página responde
500 para quem abre. **A saúde do build não é a saúde do produto**, e nada no
caminho normal media a segunda.

Ela faz duas coisas, e a segunda é a que o `select 1` sozinho não faz:

| Consulta | O que prova |
|---|---|
| `select 1` | a conexão **de verdade**, no runtime de verdade, com a variável de verdade — e não "a variável está definida" |
| um evento não excluído | que **há evento para resolver**. Um banco migrado e vazio passa na primeira e reprova aqui — e é esse o estado em que `/` responde 404 para todo mundo com a plataforma dizendo READY |

Resposta: `{ ok, evento_resolvido }`. Banco caído é **503**, nunca 200 com
`ok: false` — um 200 mentiroso atravessa qualquer monitor sem acender nada, que é
o defeito que ela existe para não repetir. E a falha vira **linha em
`eventos_de_erro`**, porque foi o silêncio que deixou os seis deploys passarem.

> #### O que ela NÃO pega
>
> Está escrito aqui e no cabeçalho da rota, e o motivo de estar escrito duas
> vezes é o mesmo: **uma verificação que parece cobrir mais do que cobre é pior
> que nenhuma** — ela transfere a confiança sem transferir a garantia, e a
> próxima pessoa para de olhar.
>
> 1. **Página que renderiza torta.** Ela não abre página nenhuma. Layout
>    quebrado, seção fora de lugar, foto esticada: tudo passa em verde.
> 2. **Variável certa apontando para o banco errado.** Uma `DATABASE_URL` válida
>    para o banco de desenvolvimento responde `ok: true` e
>    `evento_resolvido: true` — e o casamento que o convidado abre é outro. Ela
>    mede que **há** banco, não **qual** banco.
> 3. **O R2.** Ela não escreve nem lê no balde. `R2_PUBLIC_BASE` vazia deixa a
>    galeria fora do ar com esta rota dizendo `ok`. Foi decisão: um teste de
>    saúde que escreve num balde suja produção todo dia.
> 4. **Lentidão.** `select 1` responde rápido num banco que está levando quinze
>    segundos por consulta real.

---

## Analytics

Dicionário de eventos em [`docs/analytics.md`](docs/analytics.md). Nenhum evento
existe fora dele, e a assinatura é tipada — nome errado quebra o `tsc` em vez de
sumir em silêncio no relatório, que o GA4 não preenche retroativamente.

**Nenhuma PII, e isso é catraca, não promessa.** Nenhuma URL do produto chega ao
GA4 legível: `page_location`, `page_title` e `page_referrer` são declarados em
todo hit e mascarados para `https://casa-nos.invalid/e/<wedding_id>`. O
identificador que viaja é o `wedding_id`, que é opaco. O modo de consentimento
nasce em `denied`, sem banner.

O motivo de cada uma dessas escolhas — e o que saía antes, medido no fio — está
em [`docs/adr/0003-url-mascarada-e-consentimento-negado.md`](docs/adr/0003-url-mascarada-e-consentimento-negado.md).

**O que a v1.0 decidiu não medir**, e está escrito em
[`docs/analytics.md`](docs/analytics.md) para ninguém "consertar" um zero que é
decisão: `wedding_created` não é emitido (o evento nasce por
`pnpm db:bootstrap`, não por navegador); os treze eventos do álbum continuam
declarados e não viajam, porque as telas que os emitem respondem 404 com
`album_ativo = false`; e **a galeria do casal não emite evento nenhum** —
`metricas.md` não declara nenhum, e inventar um nome no meio de uma história o
deixaria no relatório para sempre. A prévia também não emite `page_view`: ela é
do casal, e oito aberturas numa noite contaminariam a medição de um site que
ainda não teve um único convidado.

---

## Documentação

- [`docs/fatia-0.md`](docs/fatia-0.md) — o que ficou de fora, de propósito
- [`docs/fatia-1-f1-1-f1-2.md`](docs/fatia-1-f1-1-f1-2.md) — o que entrou na F1.1 e na F1.2, o que ficou de fora e por quê, e o que faltou nos documentos
- [`docs/fatia-1-f1-3-f1-4.md`](docs/fatia-1-f1-3-f1-4.md) — a F1.3 e a F1.4: o QR escrito à mão, o telão que não pode contar que quebrou, e o que **não** foi provado sobre o feed com 6.000 itens
- [`docs/fila-local.md`](docs/fila-local.md) — **o contrato do registro no IndexedDB**. Leia antes de mexer na fila
- [`docs/analytics.md`](docs/analytics.md) — dicionário de eventos GA4
- [`docs/openapi-casa-nos.json`](docs/openapi-casa-nos.json) — contrato da API, **gerado**: não edite a mão
- [`docs/adr/0001-evento-como-inquilino.md`](docs/adr/0001-evento-como-inquilino.md)
- [`docs/adr/0002-mapa-sem-chave-de-api.md`](docs/adr/0002-mapa-sem-chave-de-api.md)
- [`docs/adr/0003-url-mascarada-e-consentimento-negado.md`](docs/adr/0003-url-mascarada-e-consentimento-negado.md)
- [`docs/adr/0004-erro-em-tabela-do-proprio-banco.md`](docs/adr/0004-erro-em-tabela-do-proprio-banco.md)
- [`docs/fatia-1-f1-5-f1-7.md`](docs/fatia-1-f1-5-f1-7.md) — a F1.5 a F1.7: a moderação, os números honestos, a reconciliação, o loop, e o que ficou de fora
- [`docs/carga-fatia-1.md`](docs/carga-fatia-1.md) — **o teste de carga com 200 clientes**: os números, o que quebrou primeiro, e o veredito sobre a virtualização
- [`docs/adr/0005-dois-prefixos-no-balde.md`](docs/adr/0005-dois-prefixos-no-balde.md) — **`pub` é servido, `prv` não**, e o que acontece quando uma foto muda de visibilidade
- [`docs/adr/0005-leitura-de-midia-por-base-publica.md`](docs/adr/0005-leitura-de-midia-por-base-publica.md) — a primeira redação do 0005, **rejeitada**, e por que a lápide fica

---

## Convenções

- Comentário explica **por quê**, não o quê. Comentário que registra um bug real
  vale mais que dez descrevendo sintaxe.
- Commit em português, sem acento, descrevendo o efeito para quem usa:
  `fix(site): a data do casamento aparecia um dia antes no servidor em UTC`.
- Cor nunca é literal: ela vem de `lib/tokens.ts` ou não existe.
- Componente visual vem do MUI. `components/ui/` não nasce.
- Tailwind só posiciona.
