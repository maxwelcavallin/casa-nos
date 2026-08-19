"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import { useRef } from "react";

import { IndicadorEnvio } from "@/components/album/IndicadorEnvio";
import type { EstadoDaFila } from "@/lib/fila/motor";
import { largura, toque } from "@/lib/tokens";

/**
 * A BARRA DE MANDAR — fixa no rodapé, **em todos os estados** das duas telas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELA É A MONTAGEM QUE FAZ DUAS PROMESSAS SEREM VERDADEIRAS POR CONSTRUÇÃO, e
 * não por coincidência de medida:
 *
 * 1. **"O mesmo botão, no mesmo lugar, do mesmo tamanho"** (§16.4). Se o botão
 *    morasse dentro do bloco de convite do feed vazio, ele teria de mudar de
 *    lugar quando a primeira foto chegasse — no exato instante em que o
 *    convidado decide se manda ou não. Quem ocupa a área da grade é o **bloco de
 *    convite**; o botão nunca sai do rodapé.
 * 2. **"Chegar ao botão custa no máximo dois passos de teclado"** (H-05, R11).
 *    `Tab` revela o link de salto, que é o primeiro focável da página; `Enter`
 *    leva à região *Mandar fotos*, e o foco pousa nela. Com 6.000 cards na
 *    grade, continuam sendo dois.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A CONSEQUÊNCIA DE (1), declarada: a barra existe nos **quatro** estados das
 * duas telas, inclusive no vazio e no carregando. É a leitura certa de "o álbum
 * é uma coisa só, com duas vistas, e o botão de mandar não muda de lugar entre
 * elas".
 *
 * DOIS NOMES DE REGIÃO, e a diferença é regra (§ das telas):
 *  - a região da **ação** chama-se `Mandar fotos` em toda tela, porque o botão é
 *    o mesmo em toda tela;
 *  - a região da **grade** descreve o que está dentro dela, e por isso muda —
 *    `Fotos da festa` no feed, `As minhas fotos` na tela pessoal.
 *
 * No rotor ouve-se *Mandar fotos, região*; ao chegar, *Mandar minhas fotos,
 * botão*. A diferença de uma palavra **confirma a chegada** — e nomes idênticos
 * seriam pior, porque dois itens com o mesmo nome numa lista de rotor são
 * ambiguidade.
 */

export const ID_DA_BARRA = "mandar-fotos";
export const TEXTO_DO_ATALHO = "Pular para mandar minhas fotos";
export const TEXTO_DO_BOTAO = "Mandar minhas fotos";

/**
 * O link de salto. **Primeiro focável da página**, e ele precisa ser renderizado
 * antes de tudo no DOM.
 *
 * Invisível até receber foco — e aí ele precisa aparecer, senão quem enxerga e
 * navega por teclado perde o cursor.
 *
 * O texto repete as palavras do botão **verbatim**: prometer "enviar foto" e
 * aterrissar em "mandar minhas fotos" faria quem não vê a tela ouvir uma
 * promessa e chegar noutra, sem poder conferir.
 */
export function AtalhoParaMandar() {
  return (
    <Box
      component="a"
      href={`#${ID_DA_BARRA}`}
      sx={{
        position: "absolute",
        left: -9999,
        top: 0,
        zIndex: 10,
        p: 1,
        bgcolor: "background.paper",
        "&:focus": { left: 8, top: 8 },
      }}
    >
      {TEXTO_DO_ATALHO}
    </Box>
  );
}

export type PropriedadesDaBarra = {
  estadoDaFila: EstadoDaFila;
  /** `null` quando o envio não está disponível: a barra some junto. */
  aoEscolherArquivos: ((arquivos: File[]) => void) | null;
  /** Ação do indicador. Só o portal cativo tem uma. */
  acaoDoIndicador?: { rotulo: string; aoTocar: () => void };
  /**
   * `false` em "as minhas fotos", onde o slot da fila mora **no topo**.
   *
   * As duas telas têm um slot só para a fila, e ele fica em lugares diferentes
   * de propósito: no feed, acima da barra (é ali que o convidado está olhando
   * quando manda); em "as minhas fotos", acima da grade, porque ali ele divide o
   * espaço com a linha da versão maior — e **duas mensagens empilhadas sobre o
   * mesmo estado se contradizem, com a de baixo nunca sendo lida**.
   */
  comIndicador?: boolean;
  /** Conteúdo extra abaixo do botão — o link de volta ao feed, em "minhas". */
  extra?: React.ReactNode;
};

export function BarraDeEnvio({
  estadoDaFila,
  aoEscolherArquivos,
  acaoDoIndicador,
  comIndicador = true,
  extra,
}: PropriedadesDaBarra) {
  const entrada = useRef<HTMLInputElement>(null);

  return (
    <Paper
      elevation={0}
      square
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        borderTop: 1,
        borderColor: "divider",
        pb: "env(safe-area-inset-bottom)",
        zIndex: 1,
      }}
    >
      {comIndicador ? (
        // Ver `ResumoDoTopo`: a `key` é o que zera o recolhimento do "Tudo aqui".
        <IndicadorEnvio
          key={estadoDaFila.situacao}
          estado={estadoDaFila}
          acao={acaoDoIndicador}
        />
      ) : null}
      <Box
        id={ID_DA_BARRA}
        component="section"
        aria-label="Mandar fotos"
        tabIndex={-1}
        sx={{ maxWidth: largura.app, mx: "auto", px: { xs: 2, sm: 3 }, py: 1.5 }}
      >
        {aoEscolherArquivos ? (
          <>
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={evento => {
                const arquivos = Array.from(evento.target.files ?? []);
                // O campo é zerado ANTES de qualquer espera: sem isso, escolher a
                // mesma foto duas vezes seguidas não dispara `change` na segunda,
                // e a pessoa acha que o produto ignorou o toque dela.
                evento.target.value = "";
                if (arquivos.length > 0) aoEscolherArquivos(arquivos);
              }}
            />
            <Button
              variant="contained"
              fullWidth
              onClick={() => entrada.current?.click()}
              sx={{ minHeight: toque.confortavel }}
            >
              {TEXTO_DO_BOTAO}
            </Button>
          </>
        ) : null}
        {extra}
      </Box>
    </Paper>
  );
}

export default BarraDeEnvio;
