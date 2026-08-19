"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { FolhaOuDialogo } from "@/components/FolhaOuDialogo";
import {
  AVISO_DE_LINK_NOVO,
  ERRO_DO_LINK_GUARDADO,
  EXPLICACAO_DO_LINK_GUARDADO,
  RISCO_DO_LINK_GUARDADO,
  TITULO_DO_LINK_GUARDADO,
} from "@/lib/textos-do-loop";
import { toque } from "@/lib/tokens";

/**
 * O LINK GUARDADO (H-22) — a mitigação do R8, e **não** uma conta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **NADA AQUI DIZ "SEU ÁLBUM ESTÁ SEGURO".** A identidade deste produto vive num
 * cookie (Q4), e este link é o que existe para quando o cookie sumir — troca de
 * celular, navegador limpo, aba anônima fechada. Prometer segurança seria vender
 * uma conta que não existe.
 *
 * **A LINHA DE RISCO FICA ACIMA DOS BOTÕES**, e não em letra miúda no rodapé:
 * *"Quem tiver este link pode ver, mudar e apagar as suas fotos."* É a
 * informação que decide se a pessoa manda o link para um grupo de WhatsApp, e
 * por isso precisa ser lida **antes** da decisão — exatamente como a explicação
 * da folha de envio.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **NENHUM TELEFONE É ARMAZENADO** (critério da história). O `wa.me` abre o
 * WhatsApp com a mensagem pronta e a pessoa escolhe para quem manda — inclusive
 * para ela mesma. O servidor nunca vê esse número.
 */

export type PropriedadesDoLinkGuardado = {
  aberta: boolean;
  aoFechar: () => void;
  eventoId: string;
  /** O nome do casal, para a mensagem pronta do `wa.me`. */
  nomeCasal: string;
  aoConcluir: (recado: string) => void;
};

export function FolhaDoLinkGuardado({
  aberta,
  aoFechar,
  eventoId,
  nomeCasal,
  aoConcluir,
}: PropriedadesDoLinkGuardado) {
  const [url, setUrl] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `/api/eventos/${eventoId}/participacoes/atual/recuperacao`,
        { method: "POST" }
      );
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as { url: string };
      setUrl(corpo.url);
    } catch {
      /**
       * O ERRO ENTREGA A GARANTIA, que é o que a pessoa quer saber: *"O seu link
       * anterior continua valendo."* A geração é um `update` só — ou acontece
       * inteira, ou não acontece —, então a frase é verdadeira, e não um
       * consolo.
       */
      setErro(ERRO_DO_LINK_GUARDADO);
    } finally {
      setGerando(false);
    }
  }

  const mensagem = url
    ? `Minhas fotos do casamento de ${nomeCasal}: ${url}`
    : "";

  return (
    <FolhaOuDialogo
      aberta={aberta}
      aoFechar={aoFechar}
      titulo={TITULO_DO_LINK_GUARDADO}
      rodape={
        url ? (
          <>
            <Button
              variant="contained"
              fullWidth
              component="a"
              href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ minHeight: toque.confortavel }}
            >
              Mandar para mim no WhatsApp
            </Button>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                void navigator.clipboard?.writeText(url);
                aoConcluir("Copiamos o link.");
                aoFechar();
              }}
              sx={{ minHeight: toque.confortavel }}
            >
              Copiar o link
            </Button>
          </>
        ) : (
          <Button
            variant="contained"
            fullWidth
            disabled={gerando}
            onClick={() => void gerar()}
            sx={{ minHeight: toque.confortavel }}
          >
            {gerando ? "Salvando…" : "Guardar o meu link"}
          </Button>
        )
      }
    >
      <Stack sx={{ gap: 1.5 }}>
        <Typography variant="body1">{EXPLICACAO_DO_LINK_GUARDADO}</Typography>
        {/* A linha de risco. Acima dos botões, e nunca em letra miúda. */}
        <Typography variant="body2">{RISCO_DO_LINK_GUARDADO}</Typography>
        {url ? (
          <>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", wordBreak: "break-all" }}
            >
              {url}
            </Typography>
            {/* Dito DEPOIS de gerar, e não antes: quem ainda não tem link não
                tem anterior para cancelar, e o aviso confundiria. */}
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {AVISO_DE_LINK_NOVO}
            </Typography>
          </>
        ) : null}
        {erro ? (
          <Typography variant="body2" sx={{ color: "warning.main" }}>
            {erro}
          </Typography>
        ) : null}
      </Stack>
    </FolhaOuDialogo>
  );
}

export default FolhaDoLinkGuardado;
