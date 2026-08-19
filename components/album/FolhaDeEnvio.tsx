"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { FolhaOuDialogo } from "@/components/FolhaOuDialogo";
import { GradeMidias } from "@/components/album/GradeMidias";
import type { Visibilidade } from "@/lib/midias";
import { raio, toque } from "@/lib/tokens";

/**
 * A FOLHA DE ENVIO — **os dois botões SÃO a escolha de visibilidade** (H-10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA É A ÚNICA FOLHA DO PRODUTO COM RESTRIÇÃO DE NEUTRALIDADE (§16.5b), e a
 * razão é mensurável, não estética:
 *
 * > **A razão entre os cliques nos dois botões é o instrumento que mede a
 * > hipótese central do produto.** Qualquer empurrão visual contamina o número
 * > que decide se a funcionalidade continua existindo.
 *
 * AS OITO PROIBIÇÕES, e cada uma está cumprida aqui, no código:
 *
 *  1. Sem selo, chip ou etiqueta de "recomendado" / "mais usado" / "a maioria
 *     escolhe" em nenhum dos dois.
 *  2. Sem pré-seleção e sem `autoFocus`. O foco inicial é o **título** — é por
 *     isso que `FolhaOuDialogo` não aceita uma prop de foco inicial: o caminho
 *     errado não existe.
 *  3. Ordem fixa: o primário sempre em cima, em todos os eventos.
 *  4. Nenhum dos dois tem ícone.
 *  5. Mesmo alvo de toque: 48 de altura, largura total, os dois.
 *  6. Mesma animação de entrada — a folha entra inteira; os botões não entram
 *     separados.
 *  7. Nenhuma contagem, nenhuma prova social.
 *  8. Nenhuma cor de estado. **`feed` não é `success`** e `noivos` não é
 *     `warning`.
 *
 * O secundário perde peso **por uma coisa só**: não ter preenchimento.
 * `outlined`, nunca `text` — a H-10 proíbe "link cinza". É a menor diferença que
 * ainda comunica hierarquia, e é deliberadamente a menor.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A ORDEM DE CIMA PARA BAIXO É REGRA: alça · título · miniaturas · **explicação
 * acima dos dois botões** (lida antes da decisão) · primário · secundário ·
 * **ressalva abaixo dos dois** (é reparo para quem errou, não permissão para
 * escolher no chute).
 */

/** As miniaturas locais, já lidas do arquivo. Nada aqui busca rede. */
export type PreviaLocal = { chave: string; url: string | null };

export type PropriedadesDaFolhaDeEnvio = {
  aberta: boolean;
  aoFechar: () => void;
  previas: PreviaLocal[];
  /** Quantos vídeos foram recusados no aparelho (RN-12). */
  videosRecusados: number;
  aoEscolher: (visibilidade: Visibilidade) => void;
};

export const EXPLICACAO =
  "Foto da festa aparece no telão e para quem está aqui. Foto dos noivos, só eles veem.";
export const RESSALVA = 'Dá para mudar depois, em "as minhas fotos".';

export function FolhaDeEnvio({
  aberta,
  aoFechar,
  previas,
  videosRecusados,
  aoEscolher,
}: PropriedadesDaFolhaDeEnvio) {
  const quantas = previas.length;
  const soVideo = quantas === 0 && videosRecusados > 0;

  const titulo = soVideo
    ? "Nenhuma foto escolhida"
    : quantas === 1
      ? "1 foto escolhida"
      : `${quantas} fotos escolhidas`;

  const avisoDeVideo =
    videosRecusados === 0
      ? null
      : quantas > 0
        ? `Por enquanto só foto. Mandamos as ${quantas} ${quantas === 1 ? "foto" : "fotos"} deste lote e o vídeo ficou de fora.`
        : "Por enquanto só foto. Escolha as fotos e a gente manda.";

  return (
    <FolhaOuDialogo
      aberta={aberta}
      aoFechar={aoFechar}
      titulo={titulo}
      rodape={
        <>
          {/* A explicação vem ANTES dos botões, em `body2`/`textPrimary`: ela
              precisa ser lida antes da decisão, não depois dela. */}
          <Typography variant="body2">{EXPLICACAO}</Typography>

          <Button
            variant="contained"
            fullWidth
            // `aria-disabled` e não `disabled`: com `disabled` o botão sai da
            // ordem de foco e some do rotor, e um botão que some **troca a folha
            // de forma** e move a decisão de lugar. Ele fica no lugar, do mesmo
            // tamanho, e não faz nada.
            aria-disabled={soVideo}
            onClick={() => (soVideo ? undefined : aoEscolher("feed"))}
            sx={{ minHeight: toque.confortavel, borderRadius: `${raio.botao}px` }}
          >
            Mandar para a festa
          </Button>

          <Button
            variant="outlined"
            fullWidth
            aria-disabled={soVideo}
            onClick={() => (soVideo ? undefined : aoEscolher("noivos"))}
            sx={{ minHeight: toque.confortavel, borderRadius: `${raio.botao}px` }}
          >
            Mandar só para os noivos
          </Button>

          {/* A ressalva vem DEPOIS, em `caption`/`textSecondary`: é reparo para
              quem errou, não permissão para escolher no chute. */}
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {RESSALVA}
          </Typography>
        </>
      }
    >
      {avisoDeVideo ? (
        <Box
          role="status"
          sx={{
            // `warningBg`, nunca `errorBg`: nada quebrou. A frase é específica —
            // nunca "arquivo inválido", que culparia quem escolheu.
            bgcolor: "warning.light",
            color: "text.primary",
            borderRadius: `${raio.input}px`,
            p: 1.5,
            mb: 2,
          }}
        >
          <Typography variant="body2">{avisoDeVideo}</Typography>
        </Box>
      ) : null}

      {/**
       * AS MINIATURAS SÃO LOCAIS e aparecem antes de qualquer rede — não há
       * esqueleto e não há texto de carregamento, porque não há espera de rede
       * para esconder. O que carrega é a leitura do arquivo no próprio aparelho.
       *
       * Elas não são focáveis: são imagem, e o que se decide aqui são os dois
       * botões do rodapé.
       */}
      <GradeMidias>
        {previas.map(previa => (
          <Box
            key={previa.chave}
            sx={{
              aspectRatio: "1 / 1",
              borderRadius: `${raio.input}px`,
              overflow: "hidden",
              bgcolor: "divider",
            }}
          >
            {previa.url ? (
              <Box
                component="img"
                src={previa.url}
                alt=""
                sx={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : null}
          </Box>
        ))}
      </GradeMidias>
    </FolhaOuDialogo>
  );
}

export default FolhaDeEnvio;
