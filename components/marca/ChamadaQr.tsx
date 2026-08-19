"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { escalaProjecao, raio } from "@/lib/tokens";

/**
 * `ChamadaQr` (design system §16.9) — **uma fonte, dois destinos**.
 *
 * Estado vazio do telão (H-12) e os materiais impressos (H-04). O PRD é
 * explícito: *"é o mesmo recurso que a tela do telão usa no estado vazio — uma
 * fonte, dois destinos"*. Então é **um componente com densidades**, não dois
 * desenhos que alguém precisa lembrar de manter iguais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMO ELE SERVE DUAS SUPERFÍCIES SEM UM ÚNICO TAMANHO ESCRITO AQUI: ele usa
 * **variantes** (`h1`, `h2`, `h3`, `subtitle1`) e nada mais. Dentro do
 * `PalcoTelao` elas valem 5vw, 4vw e 4,8vw (o `temaTelao`); dentro do painel
 * valem os tamanhos da página. A mesma marcação, dois tamanhos, zero
 * `fontSize`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O QR **NUNCA É INVERTIDO**: módulos escuros sobre campo claro, sempre. Parte
 * dos leitores de câmera falha com o negativo — e é por isso que, mesmo num
 * telão escuro, o código vive dentro de um **cartão claro**. Esse cartão é o
 * único campo claro permitido na parede, e ele tem teto de área (25%): 30vw de
 * lado mais 2,5vw de respiro de cada lado dão 35vw de largura, ~21,7% da tela.
 *
 * O ENDEREÇO POR EXTENSO É OBRIGATÓRIO, abaixo do código. É a **única
 * retentativa que o passo 1 do fluxo tem** (`escopo-core.md` §1): quando o QR
 * não lê — luz ruim, câmera velha, papel amassado —, é ele que salva a foto.
 */

export type DensidadeDaChamada = "telao" | "cartaz" | "mesa";

export type PropriedadesDaChamada = {
  densidade: DensidadeDaChamada;
  nomeCasal: string;
  /** O endereço escrito, legível a 30 cm. Sem esquema e sem `?o=`. */
  endereco: string;
  /** A URL do SVG do código (`/api/eventos/[id]/qr?o=...`). */
  urlDoQr: string;
  /**
   * A frase extra. **Só a densidade `cartaz` a aceita**, e a restrição é do
   * componente, não de quem monta a tela (§16.9).
   *
   * Em `mesa` o espaço dela é **vazio** — vazio mesmo, não "a definir" e não uma
   * versão curta: quem está na mesa tem o celular na mão e três segundos, e cada
   * linha a mais compete com a instrução. Em `telao`, quem está a 12 metros da
   * parede não lê uma quarta linha.
   */
  frase?: string;
};

/**
 * A variante do nome sai do **comprimento da string**, não do olho de quem
 * desenha (§14.2).
 *
 * A conta, na área segura de 80vw: `h1` a 5vw dá 16 em ÷ 0,67 em por caractere =
 * **24 caracteres** por linha; `h2` a 4vw dá 20 em = 30 por linha, e duas linhas
 * = 60. O caso de teste do PRD (casal de 60 caracteres) cabe em `h2` em
 * exatamente duas linhas.
 */
export function varianteDoNome(nome: string): "h1" | "h2" {
  return nome.length <= 24 ? "h1" : "h2";
}

export function ChamadaQr({
  densidade,
  nomeCasal,
  endereco,
  urlDoQr,
  frase,
}: PropriedadesDaChamada) {
  const noTelao = densidade === "telao";
  // A regra do componente, aplicada aqui e não confiada a quem monta a tela.
  const fraseVisivel = densidade === "cartaz" ? frase : undefined;

  return (
    <Stack sx={{ alignItems: "center", textAlign: "center", gap: noTelao ? "1.5vw" : 1.5 }}>
      <Typography variant={varianteDoNome(nomeCasal)} component="p">
        {/* O "&" não é renderizado em tela nenhuma (§17.5): a conjunção escrita
            é "e". O único ampersand do produto é o monograma, que é imagem — e
            que NÃO entra na parede (§17.2, item 4). */}
        {nomeCasal}
      </Typography>

      <Box
        sx={{
          bgcolor: "background.paper",
          borderRadius: `${raio.card}px`,
          p: noTelao ? escalaProjecao.qrRespiro : 2,
          width: noTelao ? escalaProjecao.qrLado : 160,
          maxWidth: "100%",
        }}
      >
        <Box
          component="img"
          src={urlDoQr}
          /**
           * `alt` vazio, e é deliberado: o código é a forma gráfica do endereço
           * que está escrito logo abaixo, em texto. Descrevê-lo ("código QR do
           * álbum") faria o leitor de tela anunciar duas vezes a mesma coisa —
           * e a que interessa a quem não vê é a escrita, que dá para ditar.
           */
          alt=""
          sx={{ width: "100%", display: "block" }}
        />
      </Box>

      {/* A instrução é `h3` — e é ela que fixa o piso de leitura de 15 m da sala
          (§14.2). Sem verbo em cima, o QR é um enfeite. */}
      <Typography variant="h3" component="p">
        Aponte a câmera
      </Typography>

      {noTelao ? (
        <Typography variant="subtitle1" component="p">
          Suas fotos aparecem aqui
        </Typography>
      ) : null}

      {fraseVisivel ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {fraseVisivel}
        </Typography>
      ) : null}

      <Typography
        variant="subtitle1"
        component="p"
        // `primary.main` no telão é o REALCE (o "céu claro"), não o marinho —
        // ver `lib/theme-telao.ts`. Na página é o marinho. A mesma palavra, o
        // papel certo nas duas superfícies.
        sx={{ color: noTelao ? "primary.main" : "text.secondary" }}
      >
        {endereco}
      </Typography>
    </Stack>
  );
}

export default ChamadaQr;
