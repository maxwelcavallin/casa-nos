"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { FolhaOuDialogo } from "@/components/FolhaOuDialogo";
import { enviarEvento, mesParaOGa4 } from "@/lib/analytics";
import { mesPorExtenso } from "@/lib/datas";
import { marcarOrigemDoLoop } from "@/lib/origem-do-loop";
import {
  BOTAO_DE_ENVIO,
  ERRO_DO_NUMERO,
  ERRO_SEM_REDE,
  EXPLICACAO_DA_FOLHA,
  sucessoComData,
  SUCESSO_SEM_DATA,
  TEXTO_DA_PERMISSAO,
  TITULO_DA_FOLHA,
} from "@/lib/textos-do-loop";
import { toque } from "@/lib/tokens";

/**
 * A FOLHA DO CTA (H-16) — três campos, e nada mais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **NÃO EXISTE ESTADO DE CARREGANDO AQUI, E A AUSÊNCIA É DECLARADA.** A folha
 * abre com os campos prontos: não há lista para carregar, não há valor para
 * consultar, e o mês previsto é um seletor local. Um esqueleto esconderia uma
 * espera inventada.
 *
 * **ERRO NO CAMPO, SEMPRE.** Nunca um alerta no topo resumindo o que aconteceu
 * embaixo — a pessoa está no campo, e a correção é ali.
 *
 * **O NÚMERO NÃO É REFORMATADO ENQUANTO ELA DIGITA.** O campo aceita `+55 (21)
 * 90000-0000` e não mexe em nada até o envio. Máscara ao vivo num teclado de
 * celular às 23h é a origem clássica de "faltam dígitos" em número certo — e
 * este é o único formulário que um convidado preenche na festa.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O WHATSAPP VAI PARA O BANCO E **NUNCA** PARA O GA4 (RN-24). O evento leva
 * `has_date` e `expected_month`, e `expected_month` passa por `mesParaOGa4`
 * antes de sair: texto livre numa dimensão do GA4 não se limpa depois.
 */

export type PropriedadesDoCta = {
  aberta: boolean;
  aoFechar: () => void;
  eventoId: string;
  /** A superfície. Na Fatia 1 só existe uma: "as minhas fotos". */
  superficie: "confirmacao_envio" | "album";
  /** Chamada com a frase pronta do toast. */
  aoConcluir: (recado: string) => void;
};

type ErrosDeCampo = { contato?: string; mes_previsto?: string; geral?: string };

export function FolhaDoCta({
  aberta,
  aoFechar,
  eventoId,
  superficie,
  aoConcluir,
}: PropriedadesDoCta) {
  const [contato, setContato] = useState("");
  const [temData, setTemData] = useState<boolean | null>(null);
  const [mes, setMes] = useState("");
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    setErros({});
    try {
      const resposta = await fetch(`/api/eventos/${eventoId}/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contato,
          tem_data: temData === true,
          mes_previsto: temData === true ? mes : null,
          cta_superficie: superficie,
          // O servidor CONFERE esta frase contra a constante e recusa qualquer
          // outra — ver `lib/textos-do-loop.ts`. Mandá-la é o que prova que foi
          // esta a redação exibida.
          permissao_texto: TEXTO_DA_PERMISSAO,
        }),
      });

      if (resposta.status === 400) {
        const corpo = (await resposta.json()) as { detalhe?: ErrosDeCampo | string };
        setErros(
          typeof corpo.detalhe === "object" && corpo.detalhe
            ? corpo.detalhe
            : { contato: ERRO_DO_NUMERO }
        );
        return;
      }
      if (!resposta.ok) throw new Error(String(resposta.status));

      const corpo = (await resposta.json()) as {
        has_date: boolean;
        expected_month: string;
        cta_surface: "confirmacao_envio" | "album" | "feed" | "telao";
      };

      /**
       * O EVENTO SAI COM O QUE O SERVIDOR DEVOLVEU, e não com o que a tela
       * mandou. A diferença aparece no mês: o servidor é quem valida a faixa, e
       * mandar o valor digitado faria a dimensão registrar um mês que foi
       * recusado.
       */
      enviarEvento("growth_lead_captured", {
        wedding_id: eventoId,
        cta_surface: corpo.cta_surface,
        has_date: corpo.has_date ? "true" : "false",
        expected_month: mesParaOGa4(corpo.expected_month),
      });

      aoConcluir(
        corpo.has_date && corpo.expected_month
          ? sucessoComData(mesPorExtenso(corpo.expected_month))
          : SUCESSO_SEM_DATA
      );
      aoFechar();
    } catch {
      /**
       * SEM REDE: o texto promete que o lead vai junto com as fotos quando a
       * rede voltar — e a promessa é cumprida pelo servidor, não por uma fila
       * nova: o índice único `(evento_id_origem, contato)` faz o reenvio não
       * virar um segundo lead, então **repetir é seguro**. Quem repete é a
       * pessoa, tocando de novo, com o campo ainda preenchido.
       */
      setErros({ geral: ERRO_SEM_REDE });
    } finally {
      // Todo caminho de saída desliga o "enviando" (regra §12 do `stack.md`).
      setEnviando(false);
    }
  }

  return (
    <FolhaOuDialogo
      aberta={aberta}
      aoFechar={aoFechar}
      titulo={TITULO_DA_FOLHA}
      rodape={
        <Button
          variant="contained"
          fullWidth
          disabled={enviando || contato.trim() === ""}
          onClick={() => {
            marcarOrigemDoLoop(eventoId);
            void enviar();
          }}
          sx={{ minHeight: toque.confortavel }}
        >
          {enviando ? "Mandando…" : BOTAO_DE_ENVIO}
        </Button>
      }
    >
      <Stack sx={{ gap: 2 }}>
        <Typography variant="body1">{EXPLICACAO_DA_FOLHA}</Typography>

        <TextField
          fullWidth
          label="Seu WhatsApp"
          placeholder="(21) 90000-0000"
          value={contato}
          // `tel` e não `number`: `number` esconde os dígitos com zero à esquerda
          // e não aceita `+`, e o DDI é o caso de estresse desta tela.
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          onChange={evento => setContato(evento.target.value)}
          error={Boolean(erros.contato)}
          helperText={erros.contato ?? " "}
        />

        <Stack sx={{ gap: 1 }}>
          <Typography variant="subtitle2">Já tem data?</Typography>
          <ToggleButtonGroup
            exclusive
            value={temData === null ? null : temData ? "sim" : "nao"}
            onChange={(_, valor) => setTemData(valor === null ? null : valor === "sim")}
          >
            <ToggleButton value="sim" sx={{ minHeight: toque.confortavel }}>
              Tenho
            </ToggleButton>
            <ToggleButton value="nao" sx={{ minHeight: toque.confortavel }}>
              Ainda não
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {/**
         * O campo do mês **só existe quando a resposta é "Tenho"**. Ele entra
         * abaixo do par de opções e a folha cresce; ela não troca de altura por
         * animação, porque o rodapé é fixo e o corpo rola.
         */}
        {temData === true ? (
          <TextField
            fullWidth
            type="month"
            label="Mês previsto"
            value={mes}
            onChange={evento => setMes(evento.target.value)}
            error={Boolean(erros.mes_previsto)}
            helperText={erros.mes_previsto ?? ERRO_DO_MES_AJUDA}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        ) : null}

        {erros.geral ? (
          <Typography variant="body2" sx={{ color: "warning.main" }}>
            {erros.geral}
          </Typography>
        ) : null}

        {/**
         * A PERMISSÃO FICA IMEDIATAMENTE ACIMA DO BOTÃO, e este é o texto que é
         * gravado em `leads.permissao_texto`. Sem ele no banco, daqui a um ano
         * ninguém sabe ao que a pessoa consentiu.
         */}
        <Typography variant="body2">{TEXTO_DA_PERMISSAO}</Typography>
      </Stack>
    </FolhaOuDialogo>
  );
}

/** Ajuda do campo de mês. Vira erro quando o servidor recusa a faixa. */
const ERRO_DO_MES_AJUDA = " ";

export default FolhaDoCta;
