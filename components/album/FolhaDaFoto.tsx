"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Check, Lock, Users } from "lucide-react";
import { useState } from "react";

import { FolhaOuDialogo } from "@/components/FolhaOuDialogo";
import { EXPLICACAO_DO_SELO, ROTULO_DO_SELO } from "@/components/album/SeloEstado";
import type { MinhaMidia } from "@/lib/feed";
import type { Visibilidade } from "@/lib/midias";
import { raio, toque } from "@/lib/tokens";

/**
 * A FOTO ABERTA, e as ações que ela oferece (H-08, H-10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRÊS PAINÉIS NA MESMA FOLHA, e não três folhas: `ver` → `escolher` →
 * `confirmar`. Uma folha que abre outra folha empilha dois véus e dois focos
 * presos, e no celular a segunda cobre a primeira sem que a pessoa entenda o que
 * fechou o quê.
 *
 * **A LINHA POR ITEM É AQUI, E SÓ AQUI** (§15.4b, RN-32d). O convite a voltar
 * mora no resumo do topo, uma vez por participação; o que aparece por foto é o
 * **estado dela**, em ≤ 60 caracteres. Repetir o pedido em 200 cards seria uma
 * cobrança multiplicada por 200 — informar no topo é uma frase.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **SEM VÉU SOBRE A FOTO**: o texto está fora dela, embaixo. Véu numa faixa de
 * 24 px escurece a foto sem salvar contraste nenhum (§16.2).
 */

export const TETO_DA_LINHA_POR_ITEM = 60;

export type PropriedadesDaFolhaDaFoto = {
  midia: MinhaMidia | null;
  aoFechar: () => void;
  aoTrocar: (nova: Visibilidade) => void;
  aoApagar: () => void;
};

type Painel = "ver" | "escolher" | "confirmar";

export function FolhaDaFoto({
  midia,
  aoFechar,
  aoTrocar,
  aoApagar,
}: PropriedadesDaFolhaDaFoto) {
  /**
   * O PAINEL VOLTA AO INÍCIO POR **REMONTAGEM**, e não por um efeito.
   *
   * Abrir outra foto precisa começar no painel de ver — quem cancelou uma troca
   * e abriu a foto seguinte não pode cair direto no seletor. A forma óbvia seria
   * um `useEffect` que devolve `painel` para `"ver"` quando a mídia muda; ela é
   * uma cascata de renderização (o React desenha o painel errado e corrige no
   * quadro seguinte), e o lint recusa com razão.
   *
   * `MinhasFotos` passa `key={midia.id}`: trocar de foto **remonta** este
   * componente, e `useState("ver")` já começa certo. Zero efeito, zero quadro
   * intermediário. A dependência está escrita aqui porque ela mora na chamada, e
   * quem remover a `key` de lá quebra isto sem nada acusar.
   */
  const [painel, setPainel] = useState<Painel>("ver");

  if (!midia) return null;

  const atual = midia.visibilidade;
  const imagem = midia.previa ?? midia.miniatura;

  const opcoes: Array<{ valor: Visibilidade; rotulo: string; Glifo: typeof Users }> = [
    { valor: "feed", rotulo: ROTULO_DO_SELO.feed, Glifo: Users },
    { valor: "noivos", rotulo: ROTULO_DO_SELO.noivos, Glifo: Lock },
  ];

  const titulo = painel === "ver" ? "Sua foto" : "Quem vê esta foto?";

  const rodape =
    painel === "ver" ? (
      <>
        <Button
          variant="outlined"
          fullWidth
          onClick={() => setPainel("escolher")}
          sx={{ minHeight: toque.confortavel }}
        >
          {/* 13 caracteres. É a pergunta do canto B dita em voz de ação — e é
              literalmente a objeção do convidado ("quem mais vai ver isso?")
              virada em controle. */}
          Mudar quem vê
        </Button>
        <Button
          variant="text"
          fullWidth
          onClick={aoApagar}
          sx={{ minHeight: toque.confortavel }}
        >
          Apagar
        </Button>
      </>
    ) : painel === "confirmar" ? (
      <>
        <Button
          variant="contained"
          fullWidth
          onClick={() => aoTrocar("feed")}
          sx={{ minHeight: toque.confortavel }}
        >
          Mandar para a festa
        </Button>
        <Button
          variant="outlined"
          fullWidth
          onClick={() => setPainel("escolher")}
          sx={{ minHeight: toque.confortavel }}
        >
          Deixar como está
        </Button>
      </>
    ) : undefined;

  return (
    <FolhaOuDialogo aberta aoFechar={aoFechar} titulo={titulo} rodape={rodape}>
      {imagem ? (
        <Box
          component="img"
          src={imagem}
          alt=""
          sx={{
            width: "100%",
            aspectRatio: "4 / 3",
            objectFit: "cover",
            borderRadius: `${raio.input}px`,
            mb: 2,
          }}
        />
      ) : null}

      {painel === "ver" ? (
        <Stack sx={{ gap: 0.5 }}>
          {/* A resposta do canto B, por extenso. Sem interpolação: a versão com
              o nome do casal chegaria a 80 caracteres com o casal de 60 que o
              design system manda testar. */}
          <Typography variant="body2">{EXPLICACAO_DO_SELO[atual]}</Typography>
          {midia.chegada !== "completa" ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {EXPLICACAO_DO_SELO[midia.chegada]}
            </Typography>
          ) : null}
        </Stack>
      ) : painel === "confirmar" ? (
        <Typography variant="body1">
          Esta foto vai aparecer para quem está no casamento.
        </Typography>
      ) : (
        <Stack role="radiogroup" aria-label="Quem vê esta foto?" sx={{ gap: 1 }}>
          {opcoes.map(({ valor, rotulo, Glifo }) => {
            const marcada = valor === atual;
            return (
              <Box
                key={valor}
                component="button"
                type="button"
                role="radio"
                aria-checked={marcada}
                onClick={() => {
                  if (valor === atual) return;
                  /**
                   * A ASSIMETRIA É DE PROPÓSITO, e ela não contamina medição
                   * nenhuma: ir para **mais restrito** aplica na hora; ir para
                   * **menos restrito** pergunta uma linha antes.
                   *
                   * Perguntar antes de restringir seria pôr atrito exatamente
                   * onde a pessoa está tentando se proteger. E isto acontece
                   * *depois* da escolha original, sobre uma foto que já existe —
                   * então a razão entre os cliques da folha de envio, que é o
                   * instrumento da hipótese S1, segue limpa.
                   */
                  if (valor === "feed") setPainel("confirmar");
                  else aoTrocar("noivos");
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  width: "100%",
                  minHeight: toque.confortavel,
                  px: 2,
                  textAlign: "left",
                  border: 0,
                  borderRadius: `${raio.input}px`,
                  cursor: "pointer",
                  font: "inherit",
                  // Fundo `action.selected` **e** um visto — nunca só a borda,
                  // nunca só a cor (§9). O seletor nunca fica em branco: o valor
                  // marcado é o atual, antes de qualquer rede.
                  bgcolor: marcada ? "action.selected" : "transparent",
                  color: "text.primary",
                }}
              >
                <Glifo size={18} aria-hidden />
                <Typography variant="body1" sx={{ flex: 1 }}>
                  {rotulo}
                </Typography>
                {marcada ? <Check size={18} aria-hidden /> : null}
              </Box>
            );
          })}
        </Stack>
      )}
    </FolhaOuDialogo>
  );
}

export default FolhaDaFoto;
