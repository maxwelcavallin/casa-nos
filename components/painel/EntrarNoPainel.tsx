"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { largura, toque } from "@/lib/tokens";

/**
 * A troca do convite por sessão (H-02).
 *
 * "Link expirado mostra 'este link expirou' com um botão que envia outro —
 * **nunca uma tela de erro**." A diferença não é de tom: uma tela de erro
 * transforma um atraso de trinta minutos numa parede, e quem está do outro lado
 * é a noiva tentando abrir o painel do próprio casamento.
 *
 * POR QUE UM COMPONENTE DE CLIENTE PARA UMA TROCA DE TOKEN: componente de
 * servidor não grava cookie no Next, e um `GET` que consome o convite seria
 * disparado pelo verificador de link do cliente de e-mail — o casal receberia
 * "expirou" no primeiro clique, porque o antivírus do Outlook já teria usado o
 * link. É um defeito clássico de link mágico, e ele é invisível em teste:
 * nenhum ambiente de desenvolvimento tem um antivírus abrindo os links.
 */

type Situacao = "trocando" | "expirado" | "reenviado" | "falhou";

export function EntrarNoPainel({ token }: { token: string | null }) {
  const roteador = useRouter();
  const [situacao, setSituacao] = useState<Situacao>(token ? "trocando" : "expirado");
  const [destino, setDestino] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;

    /**
     * O guarda está DENTRO do `try` (regra §6 do `stack.md`).
     *
     * Sem token não há o que trocar — mas sair antes do `finally` deixaria a
     * tela em esqueleto para sempre, sem erro e sem nada no console. Aqui o
     * `finally` não desliga um `carregando`: ele garante que a situação saia de
     * "trocando" por algum caminho, que é a mesma regra com outro nome.
     */
    (async () => {
      try {
        if (!token) return;
        const resposta = await fetch("/api/sessao/entrar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!vivo) return;

        if (resposta.ok) {
          const corpo = (await resposta.json()) as { evento_id: string };
          // Sem tela intermediária: entra direto no painel (H-02).
          roteador.replace(`/painel/${corpo.evento_id}/dia`);
          return;
        }

        // 410 é o caminho previsto (expirado, usado, inexistente — os três dão a
        // mesma resposta de propósito). Qualquer outro status é falha de rede ou
        // nossa, e ela merece um texto diferente: mandar outro link não resolve
        // um servidor fora do ar.
        setSituacao(resposta.status === 410 ? "expirado" : "falhou");
      } catch {
        if (vivo) setSituacao("falhou");
      } finally {
        if (vivo) {
          setSituacao(atual => (atual === "trocando" ? "expirado" : atual));
        }
      }
    })();

    return () => {
      vivo = false;
    };
  }, [token, roteador]);

  async function pedirOutro() {
    setEnviando(true);
    try {
      const resposta = await fetch("/api/sessao/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { destino?: string | null };
      setDestino(corpo.destino ?? null);
      setSituacao("reenviado");
    } catch {
      setSituacao("falhou");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Box
      component="main"
      sx={{ maxWidth: largura.texto, mx: "auto", px: { xs: 2, sm: 3 }, py: 8 }}
    >
      {situacao === "trocando" ? (
        // Esqueleto curto: a troca leva menos de um segundo, e um esqueleto
        // grande piscaria mais do que informaria.
        <Stack sx={{ gap: 2 }}>
          <Skeleton variant="text" sx={{ maxWidth: 320, height: 40 }} />
          <Skeleton variant="text" sx={{ maxWidth: 480 }} />
        </Stack>
      ) : null}

      {situacao === "expirado" ? (
        <Stack sx={{ gap: 2, alignItems: "flex-start" }}>
          <Typography variant="h3" component="h1">
            Este link expirou
          </Typography>
          <Typography variant="body1">
            Os links de acesso valem 30 minutos e servem uma vez. A gente manda outro
            agora.
          </Typography>
          <Button
            variant="contained"
            onClick={pedirOutro}
            disabled={enviando}
            sx={{ minHeight: toque.confortavel }}
          >
            {/* O botão desabilita durante o envio e não troca de largura: dois
                toques não podem gerar dois links. */}
            {enviando ? "Mandando…" : "Mandar um link novo"}
          </Button>
        </Stack>
      ) : null}

      {situacao === "reenviado" ? (
        <Stack sx={{ gap: 2 }}>
          <Typography variant="h3" component="h1">
            Este link expirou
          </Typography>
          <Typography variant="body1">
            {destino
              ? `Mandamos para ${destino}. Chega em até um minuto.`
              : "Mandamos outro link. Chega em até um minuto."}
          </Typography>
        </Stack>
      ) : null}

      {situacao === "falhou" ? (
        <Stack sx={{ gap: 2, alignItems: "flex-start" }}>
          <Typography variant="h3" component="h1">
            Este link expirou
          </Typography>
          <Typography variant="body1">
            Não conseguimos abrir agora. Tente de novo em alguns instantes.
          </Typography>
          <Button variant="outlined" onClick={() => location.reload()}>
            Tentar de novo
          </Button>
        </Stack>
      ) : null}
    </Box>
  );
}
