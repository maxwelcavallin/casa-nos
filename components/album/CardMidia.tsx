"use client";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { Image as IconeDeImagem } from "lucide-react";

import { ROTULO_DO_SELO, SeloEstado, seloDeChegada } from "@/components/album/SeloEstado";
import type { EstadoDeChegada } from "@/lib/feed";
import type { Visibilidade } from "@/lib/midias";
import { grade, raio, traco } from "@/lib/tokens";

/**
 * `CardMidia` (design system §16.2) — quatro telas.
 *
 * Feed · minhas fotos · painel de mídias · painel da fila.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROPORÇÃO 1:1 COM `object-fit: cover`, e é decisão determinística: resolve
 * "vertical e panorâmica na mesma grade" (H-11) sem nenhum caso especial. **A
 * parede é o contrário** (`contain`, §14.6), e a diferença é justificada: aqui a
 * foto abre com um toque, lá 150 pessoas veem o corte e ninguém pode desfazê-lo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O ALVO DE TOQUE É O CARD INTEIRO, mínimo 104 px nos dois eixos. Nada dentro
 * dele é clicável — nem o selo, nem a contagem do lote.
 */

export type PropriedadesDoCard = {
  /** A miniatura de 400 px. `null` = o navegador não decodificou o formato. */
  miniatura: string | null;
  /** Quem vê. **Presente em 100% dos cards de "as minhas fotos"** (RN-32b). */
  visibilidade?: Visibilidade;
  /** Já chegou. Ausente no feed, onde ele nunca varia (RN-32e). */
  chegada?: EstadoDeChegada;
  /** Acima de 1, o card vira cartão de rajada com a contagem. */
  noLote?: number;
  /** Quem enviou. Vai para o `aria-label`, **nunca desenhado sobre a foto**. */
  rotulo?: string | null;
  /** O motivo, quando o item parou. **A palavra "falhou" não entra aqui.** */
  motivo?: string | null;
  aoAbrir?: () => void;
};

/**
 * O `aria-label` do card — e ele é **carga estrutural**, não cortesia (§15.5,
 * §15.7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUAS COISAS SÓ EXISTEM AQUI PARA QUEM USA LEITOR DE TELA:
 *
 * 1. **O estado terminal.** Quando a foto chegou, o selo do canto A **some** —
 *    e ausência não é sinal para quem não vê a tela. O `aria-label` diz o estado
 *    por extenso, sempre, inclusive quando não há selo visível.
 * 2. **O rótulo de `Ainda subindo` no tile de 104 px.** Ali o chip fica só com o
 *    glifo (a assimetria de largura é o sinal mais forte, §15.7), e este
 *    `aria-label` passa a ser o **único portador escrito** daquele estado na
 *    grade. Quem editar esta função está mexendo em acessibilidade, não em
 *    texto.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function rotuloAcessivel(propriedades: PropriedadesDoCard): string {
  const partes: string[] = ["Foto"];

  if (propriedades.noLote && propriedades.noLote > 1) {
    partes[0] = `${propriedades.noLote} fotos`;
  }

  if (propriedades.visibilidade) {
    partes.push(
      propriedades.visibilidade === "feed"
        ? ROTULO_DO_SELO.feed.toLowerCase()
        : ROTULO_DO_SELO.noivos.toLowerCase()
    );
  }

  if (propriedades.rotulo) partes.push(`de ${propriedades.rotulo}`);

  const chegada = propriedades.chegada;
  if (chegada === "chegando") partes.push(ROTULO_DO_SELO.chegando.toLowerCase());
  else if (chegada === "ainda_subindo") partes.push(ROTULO_DO_SELO.ainda_subindo.toLowerCase());

  const texto = partes.join(", ");
  // O motivo entra por último e por inteiro: quem não vê o tile não vê a faixa
  // de motivo desenhada embaixo dele.
  return propriedades.motivo ? `${texto}. ${propriedades.motivo}` : texto;
}

export function CardMidia(propriedades: PropriedadesDoCard) {
  const { miniatura, visibilidade, chegada, noLote = 1, motivo, aoAbrir } = propriedades;
  const selo = chegada ? seloDeChegada(chegada) : null;
  const privada = visibilidade === "noivos";

  return (
    <ButtonBase
      onClick={aoAbrir}
      aria-label={rotuloAcessivel(propriedades)}
      sx={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        minWidth: grade.tileMinimo,
        minHeight: grade.tileMinimo,
        borderRadius: `${raio.card}px`,
        overflow: "hidden",
        display: "block",
        bgcolor: "divider",
        /**
         * A MOLDURA DE `noivos` — e ela é o que distingue os dois selos escuros.
         *
         * Em escala de cinza, `Na festa` e `Só para os noivos` são dois chips
         * escuros de tinta clara: `primary` (10.73) e `primaryDark` (13.90) são
         * próximos demais para carregar a diferença sozinhos. **A cor não
         * distingue esses dois, e não se propõe a distinguir.** Quem distingue é
         * esta moldura, que se lê numa miniatura de 104 px, em cinza, varrendo a
         * grade inteira de uma vez, sem ler chip nenhum.
         *
         * `inset` para não engordar o tile: uma moldura por fora mudaria a
         * largura do card e quebraria a grade.
         */
        ...(privada
          ? {
              boxShadow: theme =>
                `inset 0 0 0 ${traco.controle}px ${theme.palette.primary.dark}`,
            }
          : {}),
      }}
    >
      {miniatura ? (
        <Box
          component="img"
          src={miniatura}
          alt=""
          loading="lazy"
          decoding="async"
          sx={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        /**
         * AUSÊNCIA DE MINIATURA NÃO É ERRO (H-07, §16.2). É o formato que o
         * navegador não decodificou (HEIC exótico): o original sobe direto e a
         * prévia é gerada pelo servidor (decisão P12). Tile em `divider`, ícone
         * `Image` de 24 em `textSecondary`.
         *
         * **Nunca um tile de erro, nunca um X, nunca vermelho.** Nada quebrou:
         * a foto chega um pouco depois, e o texto embaixo diz isso.
         */
        <Box
          sx={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "text.secondary",
          }}
        >
          <IconeDeImagem size={24} aria-hidden />
        </Box>
      )}

      {/* Canto A — "já chegou?". Superior direito, 8 px da borda. */}
      {selo ? (
        <Box sx={{ position: "absolute", top: 8, right: 8 }}>
          <SeloEstado
            eixo="chegada"
            valor={selo}
            /**
             * `Chegando` COM rótulo, `Ainda subindo` SÓ com o glifo (§15.7).
             * A diferença de largura é o sinal, não uma inconsistência — ver o
             * comentário de `comRotulo` em `SeloEstado`.
             */
            comRotulo={selo === "chegando"}
          />
        </Box>
      ) : null}

      {/* Canto B — "quem vê?". Inferior esquerdo, acima da barra. */}
      {visibilidade ? (
        <Box sx={{ position: "absolute", bottom: motivo ? 40 : 8, left: 8 }}>
          {/**
           * No tile mínimo de 104 px o selo de destino usa **só o ícone**: "Só
           * para os noivos" não cabe sem truncar, e o selo nunca trunca. A regra
           * §10.3 continua satisfeita porque a moldura carrega o sinal, e a
           * palavra vive no `aria-label` do card.
           */}
          <SeloEstado eixo="destino" valor={visibilidade} comRotulo={false} />
        </Box>
      ) : null}

      {/* Cartão de rajada — a contagem do lote inteiro (RN-17). */}
      {noLote > 1 ? (
        <Box sx={{ position: "absolute", top: 8, left: 8 }}>
          <Box
            sx={{
              bgcolor: "action.selected",
              color: "text.primary",
              borderRadius: `${raio.pilula}px`,
              px: 1,
              py: 0.25,
            }}
          >
            <Typography variant="caption">+{noLote - 1}</Typography>
          </Box>
        </Box>
      ) : null}

      {/**
       * A BARRA DE 3 px NO RODAPÉ — e ela existe **só** no `Chegando`.
       *
       * É o terceiro sinal não-cromático que separa os dois selos claros, e a
       * **ausência** dela no `Ainda subindo` é sinal, não esquecimento.
       * Indeterminada de propósito: uma barra determinada por bytes anda para
       * trás quando um item novo entra na fila.
       */}
      {chegada === "chegando" ? (
        <LinearProgress
          sx={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3 }}
        />
      ) : null}

      {/**
       * A faixa de motivo. `errorBg` com o texto em `caption`.
       *
       * **A palavra "falhou" não entra aqui** (`escopo-core.md` §12.8): não
       * falhou, adiou. E o selo de destino continua no lugar — a faixa não come
       * o canto B, porque "quem vê isso?" precisa estar respondida inclusive
       * quando algo deu errado.
       */}
      {motivo ? (
        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: "error.light",
            color: "text.primary",
            px: 1,
            py: 0.5,
            textAlign: "left",
          }}
        >
          <Typography variant="caption" component="span">
            {motivo}
          </Typography>
        </Box>
      ) : null}
    </ButtonBase>
  );
}

export default CardMidia;
