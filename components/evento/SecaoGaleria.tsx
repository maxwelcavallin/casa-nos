import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { ApenasParaLeitor } from "@/components/ApenasParaLeitor";
import type { FotoDoSite } from "@/lib/galeria";
import { foto, raio } from "@/lib/tokens";

/**
 * AS NOSSAS FOTOS — a galeria do casal na página pública (v1.0, V-18).
 *
 * A ficha desta tela é `design-system.md` §20.9, e o `prd-v1` **não a duplica de
 * propósito**. O que segue são as razões, porque são elas que impedem alguém de
 * "melhorar" a seção daqui a três meses e quebrar duas decisões de uma vez.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. UMA COLUNA, UMA FOTO POR LINHA, EM TODOS OS VIEWPORTS (D1).
 *
 * 1, 2, 3 ou 12 fotos mudam **só o número de linhas**. E o motivo que decide não
 * é a largura: **um tile pequeno é uma promessa de que a foto abre**, e o
 * lightbox foi cortado (D4). Não há nada para abrir — então uma miniatura de
 * 104 px do casal que não abre não é uma galeria, é uma frustração de doze
 * repetições. **É a ausência do lightbox que obriga a foto a ser grande.**
 *
 * As duas decisões se sustentam uma na outra. Quem quiser "só compactar em duas
 * colunas para caber melhor" está reabrindo o lightbox sem perceber; quem quiser
 * "só acrescentar o lightbox" está autorizando o tile pequeno. **Mexer numa
 * sozinha quebra a outra.** Por isso `GradeMidias` e `CardMidia` são proibidos
 * em `components/evento/`.
 *
 * De graça, isso resolve a objeção do `po`: numa coluna, **uma foto é uma linha
 * completa** — pixel a pixel a primeira linha de uma galeria de doze. Não existe
 * célula vazia ao lado, seta que não faz nada nem ponto de carrossel que não
 * navega. O estado de uma foto não precisa de desenho próprio porque ele não é
 * um estado especial.
 *
 * 2. PROPORÇÃO INTRÍNSECA, SEM `object-fit` NENHUM (D2).
 *
 * Nem `cover`, nem `contain`, nem `fill`, nem `aspect-ratio` literal. **A caixa
 * É a proporção da foto**, vinda de `evento_fotos.largura/altura`. Escrever
 * `contain` seria anunciar uma caixa que não bate com a imagem.
 *
 * `maxHeight: foto.tetoAltura` é o que impede um 9:16 de virar uma tela e meia,
 * e ele **não recorta**: a paisagem bate no `maxWidth` e ocupa a coluna cheia; o
 * retrato bate no `maxHeight` e **encolhe em largura mantendo a proporção**,
 * ficando centrado. Sem tarja, sem recorte, sem JavaScript.
 *
 * 3. NADA SE SOBREPÕE À FOTO (RV-27).
 *
 * Nem texto, nem chip, nem ícone, nem número, nem gradiente, nem véu de hover,
 * nem cantoneira, nem botão. E **nenhuma foto é alvo de toque**: sem
 * `cursor: pointer`, sem `role="button"`, sem `<a>`, sem hover, sem foco. Uma
 * foto que reage ao ponteiro promete abrir.
 *
 * 4. `alt=""` SEMPRE, LEGENDA NO `<figcaption>` (RV-19).
 *
 * O produto **nunca inventa** texto alternativo. E `alt` igual à legenda cumpre
 * a política duas vezes: o leitor anunciaria a mesma frase seguida, a imagem e
 * depois a legenda. Então o `alt` é `""` nos dois casos, e o que varia é o
 * `<figcaption>` — presente só quando existe legenda, e **sem caixa vazia**
 * quando não existe.
 *
 * O custo honesto: uma foto sem legenda fica **sem texto alternativo**, o que na
 * letra da WCAG 1.1.1 é uma falha conhecida. Ela é assumida porque a
 * alternativa — inventar — é pior e é irreversível: ninguém que ouve "foto do
 * casal" sabe que foi o produto que escreveu. As duas mitigações estão logo
 * abaixo, e **nenhuma delas inventa conteúdo sobre a foto**.
 *
 * 5. NÃO HÁ ESQUELETO, E NÃO É ESQUECIMENTO.
 *
 * `width` e `height` vão no elemento sempre, a caixa é reservada antes do
 * primeiro byte, e a página é renderizada no servidor. O que aparece enquanto a
 * foto não chegou é a **moldura vazia com a proporção certa** — que é a melhor
 * coisa que um esqueleto poderia fazer, sem ser um esqueleto. Um shimmer aqui é
 * enfeite que pisca.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ID_DO_TITULO = "galeria-titulo";

/**
 * A LINHA QUE NINGUÉM VÊ (`pmm`, `gtm.md` §5.17).
 *
 * **O singular não é variação mecânica, é outra frase.** "1 fotos" é o defeito
 * óbvio; `É uma foto.` é o defeito silencioso, porque ouvido sozinho soa como
 * definição e não como contagem. O `só` força a leitura de número.
 *
 * E ela **conta quantas, não o quê**. Até "fotos do casamento" seria invenção —
 * num site publicado meses antes, essas fotos costumam ser do ensaio — e "fotos
 * do casal" é uma afirmação sobre o que está no enquadramento. É a mesma política
 * que produziu o `alt=""`: se o produto não pode inventar `alt`, também não pode
 * inventar aqui.
 */
export function linhaDeContagem(quantas: number): string {
  return quantas === 1 ? "É uma foto só." : `São ${quantas} fotos.`;
}

export function SecaoGaleria({ fotos }: { fotos: FotoDoSite[] }) {
  // A SEÇÃO INTEIRA SOME sem foto (RV-02), como `SecaoHistoria` e
  // `SecaoIndicacoes` já fazem. Uma seção vazia num convite não informa nada e
  // ainda sugere que alguém esqueceu de preencher.
  if (fotos.length === 0) return null;

  return (
    <Stack component="section" aria-labelledby={ID_DO_TITULO} sx={{ gap: 2 }}>
      <Typography variant="overline" component="p" sx={{ color: "primary.dark" }}>
        Fotos
      </Typography>

      {/**
       * **O TÍTULO É OBRIGATÓRIO, E É `h2` DE VERDADE** (§20.5, §4.8.5).
       *
       * Ele deixou de ser decorativo no dia em que a seção passou a servir doze
       * imagens com `alt=""`: ele é **o nome do grupo**. O leitor de tela anuncia
       * "Nossas fotos, título 2" e quem ouve sabe onde está, mesmo sem nenhuma
       * imagem descrita. Uma seção sem título é uma região anônima cheia de
       * imagens mudas.
       *
       * `Nossas`, e não "Fotos do casal": o site fala **na voz do casal**, o
       * mesmo tempo verbal de "Casamos em domingo, 22 de agosto de 2027". Um
       * título em terceira pessoa dentro do site deles soaria como legenda de
       * catálogo.
       */}
      <Typography
        variant="h3"
        component="h2"
        id={ID_DO_TITULO}
        sx={{ color: "text.primary", textWrap: "balance" }}
      >
        Nossas fotos
      </Typography>

      {/**
       * **O NÚMERO FICA FORA DO TÍTULO**, de propósito: o título aparece na lista
       * de títulos do rotor, e uma lista que lê "Nossas fotos, 12 fotos"
       * transforma navegação em inventário. O título nomeia; esta linha conta,
       * uma vez, no fluxo.
       *
       * Sem `role="status"`: ela já nasce na página. Uma região viva a anunciaria
       * fora da ordem de leitura, no meio de outra coisa.
       *
       * **A contagem vem das fotos que realmente entraram** — `fotos` já passou
       * pelo recorte de `fotosParaOSite`, que descarta medida incoerente e foto
       * sem endereço público. Uma contagem que não bate com a tela é o defeito
       * que só quem não vê a tela descobre, e ela não tem como conferir.
       */}
      <ApenasParaLeitor component="p">{linhaDeContagem(fotos.length)}</ApenasParaLeitor>

      <Stack sx={{ gap: 3 }}>
        {fotos.map((item, indice) => (
          <Box
            // O índice como chave seria errado aqui: a lista tem identidade e
            // muda de ordem em V-19. O endereço já é único por foto.
            key={item.url}
            component="figure"
            sx={{ m: 0, width: "fit-content", maxWidth: "100%", mx: "auto" }}
          >
            <Box
              component="img"
              src={item.url}
              /* SEMPRE VAZIO. Ver o item 4 do cabeçalho. */
              alt=""
              /* De `evento_fotos`, sempre: é isto que reserva a caixa antes do
                 primeiro byte e mantém o CLS em zero. */
              width={item.largura}
              height={item.altura}
              /**
               * A PRIMEIRA CARREGA ANSIOSA, AS DEMAIS PREGUIÇOSAS.
               *
               * Uma linha, e ela funciona independentemente de onde o casal
               * arrastar a seção — as seções são reordenáveis (V-03), e a galeria
               * pode acabar logo abaixo da capa. Doze prévias de ~300 KB só
               * chegam inteiras se alguém rolar as doze.
               */
              loading={indice === 0 ? "eager" : "lazy"}
              sx={{
                display: "block",
                maxWidth: "100%",
                /* O teto de ALTURA. Não recorta: encolhe em largura. */
                maxHeight: foto.tetoAltura,
                width: "auto",
                height: "auto",
                borderRadius: `${raio.card}px`,
                /**
                 * O FILETE EXISTE POR UM CASO REAL: uma foto de vestido branco em
                 * parede clara, ou de céu estourado, sangra no algodão do fundo e
                 * o canto de 16 px **desaparece naquela foto só** — o que se lê
                 * como defeito de renderização daquela foto, não como estilo. Um
                 * pixel resolve para as doze.
                 *
                 * **SEM SOMBRA**, e a diferença é deliberada: sombra diz
                 * "levantado". Um `Card` é uma superfície que segura texto; a
                 * foto é conteúdo dentro da coluna de leitura, como os parágrafos
                 * da história.
                 */
                border: 1,
                borderColor: "divider",
              }}
            />

            {/**
             * SÓ QUANDO EXISTE. Sem `min-height`, sem `&nbsp;`, sem caixa vazia.
             *
             * A legenda alinha à esquerda **da foto**, e não da coluna — é o que
             * o `width: fit-content` do `figure` entrega de graça. Para uma
             * paisagem em largura cheia é idêntico a alinhar à coluna; para um
             * retrato que o teto encolheu, a legenda segue a foto em vez de
             * flutuar longe dela. Nenhum segundo eixo de alinhamento entra na
             * página.
             *
             * **Ela quebra, nunca trunca**: sem `noWrap`, sem reticências. Os 80
             * caracteres cabem em até duas linhas na coluna de 328 (três no pior
             * caso), e a quebra não reflui nada — a legenda fica abaixo da foto e
             * o número de linhas é conhecido antes da primeira pintura.
             */}
            {item.legenda ? (
              <Typography
                component="figcaption"
                variant="body2"
                sx={{ color: "text.secondary", mt: 1, overflowWrap: "anywhere" }}
              >
                {item.legenda}
              </Typography>
            ) : null}
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

export default SecaoGaleria;
