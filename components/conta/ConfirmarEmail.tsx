"use client";

import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CascaDaConta } from "@/components/conta/CascaDaConta";

/**
 * CONFIRMAR O E-MAIL — a ponta do link que sai no cadastro.
 *
 * **É COMPONENTE DE CLIENTE POR DOIS MOTIVOS, E O SEGUNDO É O QUE IMPORTA:**
 * componente de servidor não grava cookie no Next, e um `GET` que consumisse o
 * token seria disparado pelo verificador de links do cliente de e-mail — o casal
 * receberia "este link expirou" no primeiro clique, porque o antivírus do
 * Outlook já o teria usado.
 *
 * **CONFIRMAR NÃO É OBRIGATÓRIO PARA USAR O PRODUTO**, e por isso o caminho
 * triste aqui não é uma parede: quem chega com um link vencido continua com a
 * conta funcionando, e a tela diz isso em vez de pedir uma ação que não muda
 * nada agora.
 */
export function ConfirmarEmail({ token }: { token: string | null }) {
  const roteador = useRouter();
  const [situacao, setSituacao] = useState<"conferindo" | "expirado">(
    token ? "conferindo" : "expirado"
  );

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        // O guarda mora DENTRO do `try` (`stack.md` §6): um `return` antes do
        // `finally` deixaria a tela em esqueleto para sempre.
        if (!token) return;

        const resposta = await fetch("/api/sessao/verificacao", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!vivo) return;

        if (resposta.ok) {
          const corpo = (await resposta.json()) as { evento_id: string | null };
          roteador.replace(corpo.evento_id ? `/painel/${corpo.evento_id}/site` : "/entrar");
          return;
        }
        setSituacao("expirado");
      } catch {
        if (vivo) setSituacao("expirado");
      } finally {
        if (vivo) setSituacao(atual => (atual === "conferindo" ? "expirado" : atual));
      }
    })();

    return () => {
      vivo = false;
    };
  }, [token, roteador]);

  if (situacao === "conferindo") {
    return (
      <CascaDaConta titulo="Confirmando o e-mail">
        {/* Esqueleto curto: a troca leva menos de um segundo, e um esqueleto
            grande piscaria mais do que informaria. */}
        <Stack sx={{ gap: 1 }}>
          <Skeleton variant="text" sx={{ maxWidth: 280 }} />
          <Skeleton variant="text" sx={{ maxWidth: 200 }} />
        </Stack>
      </CascaDaConta>
    );
  }

  return (
    <CascaDaConta
      titulo="Este link expirou"
      explicacao="Os links de confirmação valem uma hora e servem uma vez só."
      rodape={<Link href="/entrar">Ir para entrar</Link>}
    >
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        A conta de vocês continua funcionando normalmente — confirmar o e-mail não
        destrava nada. Ele serve para o dia em que vocês precisarem de uma senha
        nova: é para lá que o link vai.
      </Typography>
    </CascaDaConta>
  );
}

export default ConfirmarEmail;
