"use client";

import { useState } from "react";

/**
 * O ENVIO DAS TELAS DE CONTA — irmão de `useSalvamento`, e separado dele de
 * propósito.
 *
 * `useSalvamento` é dos editores do painel: ele fala de "salvar", tem a frase
 * *"o que você escreveu continua aqui"* e trata o 409 como teto de seção. Nada
 * disso serve numa tela de login, onde 409 é "e-mail já cadastrado", 401 é
 * "senha não confere" e 410 é "o link expirou". Reaproveitar o gancho custaria
 * uma cadeia de `if` sobre status dentro dele — e as duas telas passariam a
 * mentir uma sobre a outra na primeira mudança.
 *
 * **O ERRO POR CAMPO É O CONTRATO DAS ROTAS DE CONTA:**
 * `{ erro, detalhe: { campos: [{ campo, mensagem }] } }`. Quem trata isso é aqui,
 * uma vez, e não cinco telas cada uma adivinhando o formato.
 */

export type ErrosDeCampo = Record<string, string>;

export type EnvioDeConta = {
  enviando: boolean;
  erros: ErrosDeCampo;
  erroGeral: string | null;
  limpar: () => void;
  enviar: (
    url: string,
    corpo: unknown
  ) => Promise<{ ok: boolean; status: number; corpo: unknown }>;
};

/**
 * O NOME COMEÇA COM `use` contra a convenção de português deste projeto, e é a
 * mesma exceção de `useSalvamento`: a regra `react-hooks/rules-of-hooks`
 * reconhece gancho pelo prefixo, e um gancho chamado `usarX` deixa de ser
 * verificado por ela em silêncio.
 */
export function useEnvioDeConta(): EnvioDeConta {
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  function limpar() {
    setErros({});
    setErroGeral(null);
  }

  async function enviar(url: string, corpo: unknown) {
    setEnviando(true);
    setErros({});
    setErroGeral(null);
    try {
      const resposta = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });

      const lido: unknown =
        resposta.status === 204 ? null : await resposta.json().catch(() => null);

      if (resposta.ok) return { ok: true, status: resposta.status, corpo: lido };

      const campos = (lido as { detalhe?: { campos?: unknown } } | null)?.detalhe?.campos;
      const porCampo: ErrosDeCampo = {};
      if (Array.isArray(campos)) {
        for (const item of campos) {
          const { campo, mensagem } = (item ?? {}) as { campo?: unknown; mensagem?: unknown };
          if (typeof campo === "string" && typeof mensagem === "string") {
            porCampo[campo] = mensagem;
          }
        }
      }

      if (Object.keys(porCampo).length > 0) {
        setErros(porCampo);
      } else if (resposta.status === 429) {
        /**
         * O 429 não é erro de campo, e a frase diz **o que fazer**: esperar. Uma
         * mensagem genérica aqui manda a pessoa tentar de novo agora, que é
         * exatamente o que mantém o limite fechado.
         */
        setErroGeral("Muitas tentativas seguidas. Espere alguns minutos e tente de novo.");
      } else if (resposta.status === 410) {
        setErroGeral("Este link expirou ou já foi usado. Peça outro na tela de entrar.");
      } else {
        setErroGeral("Não deu para concluir agora. Tente de novo em alguns instantes.");
      }

      return { ok: false, status: resposta.status, corpo: lido };
    } catch {
      setErroGeral("Não deu para concluir agora. Tente de novo em alguns instantes.");
      return { ok: false, status: 0, corpo: null };
    } finally {
      // O desligamento no `finally`, e nenhum `return` de guarda antes dele
      // (`stack.md` §6): um caminho de saída que não desligue deixaria o botão
      // travado para sempre, sem erro e sem nada no console.
      setEnviando(false);
    }
  }

  return { enviando, erros, erroGeral, limpar, enviar };
}
