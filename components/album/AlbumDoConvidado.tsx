"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRef, useState } from "react";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { ConviteDaGrade } from "@/components/album/GradeMidias";
import { IndicadorEnvio } from "@/components/album/IndicadorEnvio";
import { RegistrarServiceWorker } from "@/components/album/RegistrarServiceWorker";
import { useFila } from "@/lib/fila/usar-fila";
import type { EstadoDoEnvio } from "@/lib/janela";
import { largura, toque } from "@/lib/tokens";

/**
 * O ÁLBUM DO CONVIDADO (H-05).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A PROMESSA DESTA TELA, e o que no código a sustenta:
 *
 * **"O botão de enviar não espera o feed."** Ele não é renderizado depois de
 * nada, não depende de estado remoto e não tem `carregando`. Não é que ele
 * carregue rápido — é que **não existe caminho de código** em que ele dependa da
 * rede. Com a rota do feed devolvendo erro, ele continua funcional, porque ele
 * nunca soube que existia uma rota de feed.
 *
 * **"Chegar ao botão custa no máximo dois passos de teclado."** `Tab` revela o
 * link de salto, que é o primeiro focável da página; `Enter` leva à região
 * "Mandar fotos", e o foco pousa nela. Com 6.000 cards na grade, continuam sendo
 * dois. O texto do salto repete as palavras do botão *verbatim* — prometer
 * "enviar foto" e aterrissar em "mandar minhas fotos" faria quem não vê a tela
 * ouvir uma promessa e chegar noutra, sem poder conferir.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LARGURA TRATADA por teto centralizado: `largura.app` (1120) com `mx: "auto"`,
 * como manda a §17.1 do design system para as telas de álbum.
 *
 * O QUE NÃO ESTÁ AQUI, DE PROPÓSITO: a grade de fotos da festa. O feed é a H-11
 * (F1.4) e ainda não tem rota; a região "Fotos da festa" existe, nomeada, e
 * mostra o estado vazio — que é o estado real do álbum até a primeira foto
 * chegar. Está registrado em `docs/fatia-1-f1-1-f1-2.md`, com o lugar em que
 * volta.
 */

export type PropriedadesDoAlbum = {
  eventoId: string;
  nomeCasal: string;
  participacaoId: string | null;
  faixaLenta: boolean;
  estadoDoEnvio: EstadoDoEnvio;
  usuario: string | null;
};

export function AlbumDoConvidado({
  eventoId,
  nomeCasal,
  participacaoId,
  faixaLenta,
  estadoDoEnvio,
  usuario,
}: PropriedadesDoAlbum) {
  const { estado, enfileirar } = useFila(
    { eventoId, participacaoId, faixaLenta },
    eventoId
  );
  const entrada = useRef<HTMLInputElement>(null);
  const [avisoDeVideo, setAvisoDeVideo] = useState<string | null>(null);

  const podeEnviar = estadoDoEnvio === "aberto" && participacaoId !== null;

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(evento.target.files ?? []);
    // O campo é zerado ANTES de qualquer espera: sem isso, escolher a mesma foto
    // duas vezes seguidas não dispara `change` na segunda, e a pessoa acha que o
    // produto ignorou o toque dela.
    evento.target.value = "";
    if (arquivos.length === 0) return;

    const resultado = await enfileirar(
      arquivos.map(arquivo => ({
        arquivo,
        nome: arquivo.name,
        tipoArquivo: arquivo.type,
        bytes: arquivo.size,
      })),
      // Visibilidade padrão nesta sub-fatia. A escolha entre "Mandar para a
      // festa" e "Mandar só para os noivos" É o botão de enviar (H-10, F1.3), e
      // ela grava exatamente este campo — nenhum contrato muda quando ela
      // chegar.
      "feed"
    );

    // Vídeo é recusado NO APARELHO (RN-12), e as fotos do mesmo lote seguem
    // normalmente. A frase é específica: nunca "arquivo inválido", que culparia
    // quem escolheu.
    if (resultado.videosRecusados > 0) {
      setAvisoDeVideo(
        resultado.enfileirados > 0
          ? `Por enquanto só foto. Mandamos as ${resultado.enfileirados} fotos deste lote e o vídeo ficou de fora.`
          : "Por enquanto só foto. Escolha as fotos e a gente manda."
      );
    } else {
      setAvisoDeVideo(null);
    }
  }

  return (
    <>
      <GoogleAnalytics eventoId={eventoId} superficie="convidado" usuario={usuario} />
      <RegistrarServiceWorker />

      <Box
        component="main"
        sx={{
          maxWidth: largura.app,
          mx: "auto",
          px: { xs: 2, sm: 3 },
          pb: 12,
          minHeight: "100dvh",
        }}
      >
        {/* O primeiro focável da página. Invisível até receber foco — e aí ele
            precisa aparecer, senão quem enxerga e navega por teclado perde o
            cursor. */}
        <Box
          component="a"
          href="#mandar-fotos"
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
          Pular para mandar minhas fotos
        </Box>

        <Stack component="header" sx={{ py: 3, gap: 0.5 }}>
          <Typography variant="h4" component="h1">
            {nomeCasal}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Fotos da festa
          </Typography>
        </Stack>

        <Box component="section" aria-label="Fotos da festa">
          <ConviteDaGrade>
            <Typography variant="h3" component="h2">
              Seja a primeira foto da festa
            </Typography>
            <Typography variant="body1">
              O que você mandar aparece aqui e no telão, em segundos.
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Não precisa instalar nada.
            </Typography>
          </ConviteDaGrade>
        </Box>

        {avisoDeVideo ? (
          <Typography
            role="status"
            variant="body2"
            sx={{ mt: 2, p: 2, bgcolor: "warning.light", borderRadius: 1 }}
          >
            {avisoDeVideo}
          </Typography>
        ) : null}
      </Box>

      {/* A BARRA FIXA NO RODAPÉ, EM TODOS OS ESTADOS. É a montagem que faz a
          regra "o mesmo botão, no mesmo lugar, do mesmo tamanho" ser verdadeira
          por construção: se o botão morasse dentro do bloco de convite, ele
          teria de mudar de lugar quando a primeira foto chegasse — no exato
          instante em que o convidado decide se manda ou não. */}
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
        }}
      >
        <IndicadorEnvio estado={estado} />
        <Box
          id="mandar-fotos"
          component="section"
          aria-label="Mandar fotos"
          tabIndex={-1}
          sx={{ maxWidth: largura.app, mx: "auto", px: { xs: 2, sm: 3 }, py: 1.5 }}
        >
          {podeEnviar ? (
            <>
              <input
                ref={entrada}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={aoEscolher}
              />
              <Button
                variant="contained"
                fullWidth
                onClick={() => entrada.current?.click()}
                sx={{ minHeight: toque.confortavel }}
              >
                Mandar minhas fotos
              </Button>
            </>
          ) : (
            <Stack sx={{ gap: 0.5 }}>
              <Typography variant="body1">
                {estadoDoEnvio === "aparelho_novo_bloqueado"
                  ? "Este álbum não está mais recebendo fotos novas."
                  : "Os envios deste casamento foram encerrados."}
              </Typography>
              {estadoDoEnvio === "fora_da_janela" ? (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  As fotos que chegaram continuam aqui.
                </Typography>
              ) : null}
            </Stack>
          )}
        </Box>
      </Paper>
    </>
  );
}
