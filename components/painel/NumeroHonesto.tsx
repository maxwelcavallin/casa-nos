"use client";

import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { toque } from "@/lib/tokens";

/**
 * `NumeroHonesto` — o componente que existe por causa de uma frase (H-14, H-19).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * *"Melhor não mostrar do que mostrar errado o número de fotos do casamento de
 * alguém."*
 *
 * TRÊS ESTADOS, E O TERCEIRO É O MOTIVO DE ELE EXISTIR:
 *
 *   carregando  → esqueleto **com a largura do número**, nunca um spinner.
 *                 Spinner no lugar de um número é lido como zero.
 *   erro        → **travessão e o motivo**, nunca um zero. Falha de leitura não
 *                 pode produzir número menor: um `0` numa tela de painel é
 *                 indistinguível de uma festa que não começou, e o casal
 *                 acreditaria nele.
 *   ausente     → "Ainda não começou" / "Denominador ainda não informado". São
 *                 ausências DIFERENTES do erro, e não podem parecer a mesma
 *                 coisa: uma é o calendário, a outra é uma pendência do casal,
 *                 a terceira é falha nossa.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O rótulo e a linha de apoio são **sempre** desenhados, mesmo sem número: as
 * sete linhas do painel do dia existem antes de existir número, e a tela não
 * encolhe nem cresce quando a festa começa.
 */

export const TRAVESSAO = "—";

export type PropriedadesDoNumero = {
  rotulo: string;
  /** O número já formatado. `null` quando não há número a mostrar. */
  valor?: string | null;
  /** A segunda grandeza, ou a explicação. **Nunca somada com a primeira.** */
  apoio?: React.ReactNode;
  carregando?: boolean;
  /** O texto do erro. Presente → travessão no lugar do número. */
  erro?: string | null;
  /** "Ainda não começou" e afins. Presente → nem número, nem erro. */
  ausente?: string | null;
  aoTentarDeNovo?: () => void;
  /** `h3` no painel de mídias (é o número principal), `h5` nas sete linhas. */
  tamanho?: "grande" | "linha";
};

export function NumeroHonesto({
  rotulo,
  valor = null,
  apoio,
  carregando = false,
  erro = null,
  ausente = null,
  aoTentarDeNovo,
  tamanho = "linha",
}: PropriedadesDoNumero) {
  const variante = tamanho === "grande" ? "h3" : "h5";

  const miolo = (() => {
    if (carregando) {
      /**
       * A LARGURA DO ESQUELETO É A DO NÚMERO, e não 100%. Um esqueleto de
       * largura total no lugar de "4.000" faz a linha inteira mudar de forma
       * quando o número chega — e a tela pisca a cada 60 segundos, que é o
       * intervalo de atualização do painel do dia.
       */
      // Altura em px, e nao `fontSize`: o esqueleto imita a CAIXA do numero, e
      // a escala tipografica e do tema (regra §10.4 do design system).
      return (
        <Skeleton
          variant="rounded"
          width={96}
          height={tamanho === "grande" ? 40 : 28}
        />
      );
    }

    if (erro) {
      return (
        <Stack sx={{ gap: 0.5 }}>
          {/* Travessão, NUNCA zero. */}
          <Typography variant={variante} component="p" aria-hidden>
            {TRAVESSAO}
          </Typography>
          <Typography variant="body2" sx={{ color: "error.main" }}>
            {erro}
          </Typography>
          {aoTentarDeNovo ? (
            <Button
              variant="text"
              onClick={aoTentarDeNovo}
              sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
            >
              Tentar de novo
            </Button>
          ) : null}
        </Stack>
      );
    }

    if (ausente) {
      // Sem travessão e sem cor de erro: não é falha, é o estado normal do
      // calendário ou uma pendência que o texto explica onde resolver.
      return (
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          {ausente}
        </Typography>
      );
    }

    return (
      <Typography variant={variante} component="p">
        {valor ?? TRAVESSAO}
      </Typography>
    );
  })();

  return (
    <Stack sx={{ gap: 0.25, py: 1 }}>
      <Typography variant="overline" sx={{ color: "text.secondary" }}>
        {rotulo}
      </Typography>
      {miolo}
      {apoio && !carregando && !erro && !ausente ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {apoio}
        </Typography>
      ) : null}
    </Stack>
  );
}

export default NumeroHonesto;
