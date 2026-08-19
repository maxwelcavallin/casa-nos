"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { enviarEvento } from "@/lib/analytics";
import { largura, toque } from "@/lib/tokens";

/**
 * O LINK GUARDADO ABERTO NOUTRO APARELHO — `/r/[token]` (H-22).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE UM COMPONENTE DE CLIENTE PARA UMA TROCA DE TOKEN — o mesmo motivo de
 * `EntrarNoPainel`, e ele já custou um defeito neste produto: um `GET` que
 * consome o link é disparado pelo **verificador de pré-visualização do
 * WhatsApp**. Como este link é feito justamente para a pessoa mandar para si
 * mesma no WhatsApp, um `GET` que consumisse faria o link morrer antes de ela
 * tocar nele. A troca é `POST`, e ela acontece aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **CARREGANDO É UM ESQUELETO CURTO, SEM TEXTO.** Não há o que explicar em meio
 * segundo, e "verificando o seu link…" ensina a pessoa a esperar por algo que
 * pode falhar.
 *
 * **NÃO EXISTE ESTADO VAZIO**, e a ausência é declarada: um link guardado sempre
 * aponta para uma participação, e uma participação sem foto cai no estado vazio
 * de "as minhas fotos", que já está desenhado lá.
 */

type Situacao = "trocando" | "invalido";

export function RetomarAlbum({ token }: { token: string | null }) {
  const roteador = useRouter();
  const [situacao, setSituacao] = useState<Situacao>(token ? "trocando" : "invalido");

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        // O guarda está DENTRO do `try`: sair antes deixaria a tela no esqueleto
        // para sempre, sem erro e sem nada no console (regra §12 do `stack.md`).
        if (!token) return;
        const resposta = await fetch("/api/sessao/retomar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!vivo) return;

        if (!resposta.ok) {
          setSituacao("invalido");
          return;
        }

        const corpo = (await resposta.json()) as { evento_id: string; slug: string };

        /**
         * `guest_identified` COM `identification_mode = retomado` (H-22).
         *
         * É o terceiro valor da dimensão, e ele existe para P saber distinguir
         * "pessoa nova" de "mesma pessoa noutro aparelho". Sem ele, uma troca de
         * celular apareceria como um convidado a mais no numerador da North
         * Star — e o número que decide o produto ficaria otimista por um motivo
         * que não é o produto.
         */
        enviarEvento("guest_identified", {
          wedding_id: corpo.evento_id,
          identification_mode: "retomado",
        });

        // `replace` e não `push`: voltar para esta tela tentaria trocar de novo
        // um token que já virou sessão.
        roteador.replace(`/e/${corpo.slug}/album/minhas`);
      } catch {
        if (vivo) setSituacao("invalido");
      }
    })();

    return () => {
      vivo = false;
    };
  }, [roteador, token]);

  return (
    <Box
      component="main"
      sx={{
        maxWidth: largura.texto,
        mx: "auto",
        px: { xs: 2, sm: 3 },
        py: 6,
        minHeight: "100dvh",
      }}
    >
      {situacao === "trocando" ? (
        <Stack sx={{ gap: 1 }} aria-busy>
          <Skeleton variant="rounded" width="60%" height={40} />
          <Skeleton variant="text" width="40%" />
        </Stack>
      ) : (
        <Stack sx={{ gap: 2, alignItems: "flex-start" }}>
          <Typography variant="h3" component="h1">
            Este link não vale mais
          </Typography>
          <Typography variant="body1">
            Se você gerou um novo, use o mais recente.
          </Typography>
          {/**
           * A SAÍDA LEVA AO FEED, e não a um beco. Quem chegou aqui está numa
           * festa (ou acabou de sair de uma) e quer ver as fotos; uma tela de
           * erro sem porta seria a única tela do produto sem saída.
           *
           * **O destino é a rota curta.** Ela redireciona para o álbum, e é o
           * único endereço que esta tela conhece sem saber o slug — o token não
           * valeu, então não houve resposta com o slug dentro.
           */}
          <Button
            component="a"
            href="/"
            variant="outlined"
            sx={{ minHeight: toque.confortavel }}
          >
            Ir para as fotos da festa
          </Button>
        </Stack>
      )}
    </Box>
  );
}

export default RetomarAlbum;
