"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { FolhaOuDialogo } from "@/components/FolhaOuDialogo";
import { FaixaVisaoDono } from "@/components/painel/FaixaVisaoDono";
import { largura, toque } from "@/lib/tokens";
import { ContextoDeSaida, type SituacaoDeSaida } from "@/lib/usar-aviso-de-saida";

/**
 * A CASCA DE TODO EDITOR DE SEÇÃO (v1.0, V-04 a V-09).
 *
 * Seis editores, um contorno só: voltar, título, uma linha dizendo para que a
 * seção serve, e o selo do dono quando for o caso. Escrever isso seis vezes é
 * como nascem seis cabeçalhos parecidos e nenhum igual — e o botão de voltar é
 * o elemento que mais some quando cada tela desenha o seu.
 *
 * LARGURA TRATADA por teto centralizado (`largura.conteudo`, 960), a medida de
 * formulário do painel. **Mobile primeiro** (RV-18): a Marina edita do celular.
 *
 * O AVISO DE "SEÇÃO DESLIGADA" MORA AQUI, e não em cada editor: o casal que abre
 * o editor de uma seção que ele desligou precisa saber que o que ele escrever
 * não vai ao ar — senão ele escreve, salva, abre o site e não encontra nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O GUARDA DA SAÍDA MORA AQUI PELO MESMO MOTIVO QUE O BOTÃO DE VOLTAR**
 * (V-15). O estado de "tem coisa não salva" nasce dentro de cada editor, e o
 * único caminho de saída que o produto desenha é este link — então o editor
 * publica a situação por contexto (`useAvisoDeSaida`) e quem intercepta é quem
 * desenha a porta. Seis editores cada um com o próprio guarda seriam seis
 * guardas, e o sexto nasceria sem.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function CascaDoEditor({
  eventoId,
  titulo,
  explicacao,
  ehDono,
  ativa,
  children,
}: {
  eventoId: string;
  titulo: string;
  explicacao: string;
  ehDono: boolean;
  ativa: boolean;
  children: React.ReactNode;
}) {
  const roteador = useRouter();
  const [situacao, setSituacao] = useState<SituacaoDeSaida>("limpo");
  const [perguntando, setPerguntando] = useState(false);

  const destino = `/painel/${eventoId}/site`;

  /**
   * `useCallback` aqui não é otimização: o valor do contexto entra na lista de
   * dependências do efeito que publica a situação, dentro do editor. Uma função
   * nova a cada renderização faria aquele efeito rodar em toda tecla digitada.
   */
  const avisar = useCallback((nova: SituacaoDeSaida) => setSituacao(nova), []);

  function sair() {
    setPerguntando(false);
    roteador.push(destino);
  }

  const enviando = situacao === "enviando";

  return (
    <Box component="main" sx={{ minHeight: "100dvh" }}>
      {ehDono ? <FaixaVisaoDono /> : null}

      <Box sx={{ maxWidth: largura.conteudo, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        <Stack sx={{ gap: 3 }}>
          <Stack sx={{ gap: 1 }}>
            <Link
              href={destino}
              onClick={evento => {
                if (situacao === "limpo") return;
                // A navegação só é interrompida quando há o que perder. Com o
                // formulário limpo, o link é um link — sem diálogo, sem atraso.
                evento.preventDefault();
                setPerguntando(true);
              }}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                alignSelf: "flex-start",
                // 44 px de alvo de toque: um "voltar" que erra o dedo no celular
                // é o pior lugar possível para errar.
                minHeight: toque.minimo,
              }}
            >
              <ArrowLeft size={16} aria-hidden />
              Voltar para o site
            </Link>

            <Typography variant="h3" component="h1">
              {titulo}
            </Typography>
            <Typography variant="body1">{explicacao}</Typography>

            {!ativa ? (
              <Typography variant="body2" sx={{ color: "warning.dark" }}>
                Esta seção está desligada. O que você escrever aqui fica guardado,
                mas não aparece no site enquanto ela não for ligada de volta.
              </Typography>
            ) : null}
          </Stack>

          <ContextoDeSaida.Provider value={avisar}>{children}</ContextoDeSaida.Provider>
        </Stack>
      </Box>

      {/**
       * DUAS SITUAÇÕES, DUAS FRASES — e a diferença não é de tom, é de fato.
       *
       * Com texto digitado, o que se perde está na tela e a saída é salvar. Com
       * um envio em curso, o que se perde é a **foto**: a linha existe sem
       * `armazenada_em`, não renderiza no site e não conta em lugar nenhum, e
       * não há botão de salvar que resolva — a saída é mandar de novo. Uma frase
       * só para os dois casos mandaria metade das pessoas procurar um botão que
       * não existe.
       */}
      <FolhaOuDialogo
        aberta={perguntando}
        aoFechar={() => setPerguntando(false)}
        // Sair perdendo o que foi digitado é destrutivo: não fecha por toque no
        // véu (design system §16.5).
        destrutiva
        titulo={enviando ? "O envio ainda não terminou" : "Sair sem salvar?"}
        rodape={
          <Stack sx={{ gap: 1 }}>
            <Button
              variant="contained"
              color="warning"
              onClick={sair}
              sx={{ minHeight: toque.minimo }}
            >
              {enviando ? "Sair mesmo assim" : "Sair sem salvar"}
            </Button>
            <Button
              variant="text"
              onClick={() => setPerguntando(false)}
              sx={{ minHeight: toque.minimo }}
            >
              {enviando ? "Esperar o envio" : "Continuar editando"}
            </Button>
          </Stack>
        }
      >
        <Typography variant="body1">
          {enviando
            ? "A foto que está subindo ainda não entrou no site. Sair agora interrompe o envio: ela não aparece para ninguém, e vocês precisam mandá-la de novo."
            : "O que vocês escreveram aqui ainda não foi salvo. Sair agora perde essa alteração, e o site continua como está hoje."}
        </Typography>
      </FolhaOuDialogo>
    </Box>
  );
}

export default CascaDoEditor;
