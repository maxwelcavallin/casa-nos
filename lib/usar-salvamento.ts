"use client";

import { useState } from "react";

/**
 * O SALVAMENTO EXPLÍCITO DOS EDITORES DE SEÇÃO (v1.0, RV-11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **NÃO HÁ SALVAMENTO AUTOMÁTICO, e a ausência é a decisão.** Este painel é
 * usado no celular, à noite, em conexão ruim (`pesquisa.md` §persona), e nessa
 * condição o salvamento automático produz salvamentos parciais que ninguém pediu
 * e que a pessoa não sabe desfazer. Salvar é um botão, e ele diz quando terminou.
 *
 * **O QUE FOI DIGITADO NUNCA SE PERDE.** Nem quando a validação reprova, nem
 * quando a rede cai. O estado do formulário é local e não é remontado a partir
 * da resposta — a noiva que preencheu seis campos no 4G do carro não pode
 * perdê-los porque o servidor demorou.
 *
 * **O ERRO VAI NO CAMPO.** A API responde `{ erro, detalhe: { campo: mensagem } }`,
 * e cada mensagem vai para o `helperText` do seu campo. Um alerta no topo
 * resumindo o que aconteceu embaixo é reprovação do design system — e, no
 * celular, ele fica fora da tela justamente quando a pessoa está no campo errado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ErrosDeCampo = Record<string, string>;

export type Salvamento = {
  salvando: boolean;
  /** `true` depois de um salvamento bem-sucedido, até a próxima digitação. */
  salvou: boolean;
  erros: ErrosDeCampo;
  /** A falha que não pertence a nenhum campo (rede, servidor fora). */
  erroGeral: string | null;
  limpar: () => void;
  enviar: (
    url: string,
    metodo: "PATCH" | "POST" | "DELETE",
    corpo?: unknown
  ) => Promise<{ ok: boolean; corpo: unknown; status: number }>;
};

/**
 * O NOME É `useSalvamento` E NÃO `usarSalvamento`, contra a convenção de nomes em
 * português deste projeto. É a mesma exceção de `useFeed` e `useMinhas`: a regra
 * `react-hooks/rules-of-hooks` do ESLint reconhece gancho pelo prefixo `use`, e
 * um gancho chamado `usarX` não é verificado por ela — as regras de ordem de
 * chamada deixam de valer em silêncio, que é a pior forma de perder uma catraca.
 * O arquivo continua em português.
 */
export function useSalvamento(): Salvamento {
  const [salvando, setSalvando] = useState(false);
  const [salvou, setSalvou] = useState(false);
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  function limpar() {
    setSalvou(false);
    setErros({});
    setErroGeral(null);
  }

  async function enviar(url: string, metodo: "PATCH" | "POST" | "DELETE", corpo?: unknown) {
    setSalvando(true);
    setErros({});
    setErroGeral(null);
    setSalvou(false);
    try {
      const resposta = await fetch(url, {
        method: metodo,
        ...(corpo === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }),
      });

      const lido: unknown =
        resposta.status === 204 ? null : await resposta.json().catch(() => null);

      if (resposta.ok) {
        setSalvou(true);
        return { ok: true, corpo: lido, status: resposta.status };
      }

      const detalhe = (lido as { detalhe?: unknown } | null)?.detalhe;
      const porCampo = paraErrosDeCampo(detalhe);

      if (Object.keys(porCampo).length > 0) {
        setErros(porCampo);
      } else {
        /**
         * Sem detalhe por campo, a mensagem diz o que aconteceu **e o que
         * sobrou**. "Erro ao salvar" não diz nem uma coisa nem outra, e deixa a
         * pessoa sem saber se pode fechar a tela.
         */
        setErroGeral(
          resposta.status === 409
            ? "Vocês chegaram ao limite desta seção. Apague um item para pôr outro."
            : "Não deu para salvar agora. O que você escreveu continua aqui."
        );
      }
      return { ok: false, corpo: lido, status: resposta.status };
    } catch {
      setErroGeral("Não deu para salvar agora. O que você escreveu continua aqui.");
      return { ok: false, corpo: null, status: 0 };
    } finally {
      // O desligamento no `finally`, e nenhum `return` de guarda antes dele
      // (`stack.md` §6): um caminho de saída que não desligue deixaria o botão
      // travado para sempre, sem erro e sem nada no console.
      setSalvando(false);
    }
  }

  return { salvando, salvou, erros, erroGeral, limpar, enviar };
}

/**
 * As DUAS formas de `detalhe` que as rotas deste produto respondem, num lugar só.
 *
 *   `{ campo: "mensagem" }`                    — as rotas de `eventos`
 *   `{ campos: [{ campo, mensagem }] }`        — as rotas de lista
 *
 * As duas existem porque nasceram em histórias diferentes, e unificá-las agora
 * mudaria o contrato de rotas já publicadas. O lugar honesto de absorver a
 * diferença é aqui — uma função, com o motivo escrito — e não seis telas cada
 * uma adivinhando.
 */
function paraErrosDeCampo(detalhe: unknown): ErrosDeCampo {
  const saida: ErrosDeCampo = {};
  if (!detalhe || typeof detalhe !== "object") return saida;

  const comLista = (detalhe as { campos?: unknown }).campos;
  if (Array.isArray(comLista)) {
    for (const item of comLista) {
      if (item && typeof item === "object") {
        const { campo, mensagem } = item as { campo?: unknown; mensagem?: unknown };
        if (typeof campo === "string" && typeof mensagem === "string") saida[campo] = mensagem;
      }
    }
    return saida;
  }

  for (const [campo, mensagem] of Object.entries(detalhe as Record<string, unknown>)) {
    if (typeof mensagem === "string") saida[campo] = mensagem;
  }
  return saida;
}
