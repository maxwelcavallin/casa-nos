"use client";

import Chip from "@mui/material/Chip";
import { ArrowUp, Layers, Lock, Users } from "lucide-react";

import type { EstadoDeChegada } from "@/lib/feed";
import { traco } from "@/lib/tokens";

/**
 * `SeloEstado` (design system §16.1, §15.2, §15.7) — DOIS EIXOS, DOIS CANTOS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UMA MÍDIA RESPONDE A DUAS PERGUNTAS, E UMA RESPOSTA NUNCA SUBSTITUI A OUTRA
 * (RN-32). Elas são simultaneamente verdadeiras: uma foto `Na festa` pode estar
 * `Chegando`, e uma foto cuja prévia chegou **já está** no feed.
 *
 *   eixo `chegada`  — "já chegou?"    canto superior direito
 *   eixo `destino`  — "quem vê isso?" canto inferior esquerdo
 *
 * O eixo `destino` está respondido em **100% das fotos**, inclusive enquanto
 * elas sobem e inclusive na miniatura. Nenhuma informação de progresso toma o
 * lugar dele — é a única pergunta que o convidado de fato faz.
 *
 * O eixo `chegada` tem três valores e **só o último é terminal**. O terminal não
 * tem selo: o canto A é o canto do que *ainda está acontecendo*, logo **canto
 * vazio significa que terminou**, e por isso nenhuma palavra terminal precisa
 * existir ali. Num álbum de 200 fotos, "chegou" é a norma, e a norma não se
 * carimba.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DUAS PROIBIÇÕES DO COMPONENTE (§16.1):
 *
 * - **Nunca é alvo de toque.** Não recebe `onClick`, não recebe `href`. Quem
 *   toca no card abre a foto; trocar visibilidade é a folha da H-10. Um chip
 *   clicável de 24 px dentro de um alvo de 104 px é uma armadilha de toque.
 * - **O rótulo nunca trunca.** Se "Só para os noivos" não couber, o selo fica só
 *   com o glifo e a palavra vai para o `aria-label` do card — nunca uma palavra
 *   pela metade.
 */

export type EixoDoSelo = "chegada" | "destino";

/** Os rótulos escritos, e eles são os do `gtm.md` §5.3. */
export const ROTULO_DO_SELO = {
  chegando: "Chegando",
  ainda_subindo: "Ainda subindo",
  feed: "Na festa",
  noivos: "Só para os noivos",
} as const;

/**
 * A explicação ao toque, por selo (`gtm.md` §5.3).
 *
 * **Nenhuma delas usa palavra terminal** — *guardada, pronta, concluída,
 * finalizada, salva, enviada, ok, completa, tudo certo* estão proibidas no eixo
 * de chegada (RN-32c), e `test/copy-minhas.test.ts` varre a lista.
 *
 * **E nenhuma interpola dado de tamanho variável.** A explicação de
 * `Só para os noivos` era *"Só Ana Flávia e Maxwel veem esta foto"* (38
 * caracteres) e chegaria a **80** com o casal de 60 que o design system manda
 * testar — um estouro que só aparece no caso de teste que ninguém roda. Virou
 * *"Só os noivos veem esta foto"*, 27, sempre.
 */
export const EXPLICACAO_DO_SELO = {
  chegando: "Está saindo do seu celular. Pode fechar a tela.",
  ainda_subindo: "Sua foto já está com os noivos. A versão maior está indo.",
  feed: "Está no álbum e pode aparecer no telão.",
  noivos: "Só os noivos veem esta foto.",
} as const;

export type ValorDoSelo = keyof typeof ROTULO_DO_SELO;

/**
 * `chegando` → o selo de chegada. `completa` → **nenhum selo** (a ausência é o
 * sinal, §15.5).
 */
export function seloDeChegada(chegada: EstadoDeChegada): "chegando" | "ainda_subindo" | null {
  return chegada === "completa" ? null : chegada;
}

const GLIFOS = {
  chegando: ArrowUp,
  ainda_subindo: Layers,
  feed: Users,
  noivos: Lock,
} as const;

export type PropriedadesDoSelo = {
  eixo: EixoDoSelo;
  valor: ValorDoSelo;
  /**
   * `false` no tile mínimo de 104 px — o selo fica só com o glifo.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * **A ASSIMETRIA DE LARGURA É SINAL, E NÃO PODE SER "SIMETRIZADA"** (§15.7).
   *
   * No tile, `Chegando` renderiza **com** rótulo escrito (~90 px) e
   * `Ainda subindo` renderiza **só com o glifo** (~28 px). Essa diferença de
   * largura é o sinal mais robusto que separa os dois em escala de cinza, em
   * miniatura, desfocado e à distância de um braço — mais forte que o glifo,
   * mais forte que a barra, muito mais forte que o contorno.
   *
   * Pôr rótulo nos dois, ou tirar dos dois, destrói a distinção mais forte do
   * conjunto para ganhar uma consistência aparente. **Não é descuido; é a
   * especificação.** Quem "arrumar" isto numa passada de ajuste visual está
   * removendo acessibilidade, não desalinho.
   * ─────────────────────────────────────────────────────────────────────────
   */
  comRotulo?: boolean;
};

export function SeloEstado({ eixo, valor, comRotulo = true }: PropriedadesDoSelo) {
  const Glifo = GLIFOS[valor];
  const escuro = eixo === "destino";
  const rotulo = ROTULO_DO_SELO[valor];

  return (
    <Chip
      size="small"
      icon={<Glifo size={14} aria-hidden />}
      /**
       * Sem rótulo o chip fica só com o ícone — e o `label` vazio é o que faz o
       * MUI não reservar espaço de texto. A palavra não some do produto: ela
       * está no `aria-label` do `CardMidia`, que é **carga estrutural** e não
       * cortesia (§15.7). `title=` não substitui: não é anunciado com
       * confiabilidade e não existe no toque.
       */
      label={comRotulo ? rotulo : ""}
      sx={{
        height: 24,
        // CÁPSULA OPACA, NUNCA TRANSLÚCIDA (§16.2). Todo selo aqui vive em cima
        // de uma foto, e não existe véu por baixo de chip: um véu numa área de
        // 24 px escurece a foto sem salvar contraste nenhum.
        bgcolor: escuro
          ? valor === "noivos"
            ? "primary.dark"
            : "primary.main"
          : "warning.light",
        color: escuro ? "primary.contrastText" : "text.primary",
        /**
         * O contorno tracejado do `Chegando`.
         *
         * ELE É EXPLICITAMENTE DECORATIVO (§15.7, sinal 4): tracejado = em
         * trânsito, contínuo = parado. A semântica é boa e está mantida, mas o
         * sistema **não se apoia nela** — se sumir numa limpeza de CSS, os três
         * sinais fortes (largura, glifo e barra) continuam de pé.
         *
         * Ele é desenhado sobre a SUPERFÍCIE do card e não sobre o
         * preenchimento do chip: `warning` sobre `warningBg` mede 1.97:1 e
         * reprovaria; sobre `surface`, 5.35:1. São dois pixels de desenho e a
         * diferença entre passar e não passar.
         */
        ...(eixo === "chegada"
          ? {
              border: `${traco.controle}px ${valor === "chegando" ? "dashed" : "solid"}`,
              // `warning.main` do tema, e não `cor.warning` importado: o assento
              // no tema existe justamente para nenhum componente precisar
              // importar a paleta (ver `lib/theme.ts`).
              borderColor: "warning.main",
            }
          : {}),
        "& .MuiChip-icon": { color: "inherit", ml: comRotulo ? undefined : 0.75, mr: comRotulo ? undefined : 0.75 },
        "& .MuiChip-label": comRotulo ? undefined : { display: "none" },
      }}
    />
  );
}

export default SeloEstado;
