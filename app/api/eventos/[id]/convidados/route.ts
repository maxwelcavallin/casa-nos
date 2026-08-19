import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import {
  importarConvidados,
  lerListaColada,
  listarConvidados,
  MAXIMO_DE_LINHAS,
  resumoDaLista,
} from "@/lib/convidados";
import { ehUuid } from "@/lib/ids";

/**
 * A LISTA DE CONVIDADOS, IMPORTADA DE UMA VEZ (H-03).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELA NÃO É UMA TELA DE CADASTRO, e o desenho da rota é o que garante isso: um
 * `POST` com um bloco de texto, e 300 linhas processadas numa requisição. Uma
 * rota "cria um convidado" obrigaria a tela a mandar 300 requisições do celular
 * da noiva — e a de número 217 falharia num 4G de elevador, deixando a lista
 * pela metade sem ninguém saber quais entraram.
 *
 * A RESPOSTA CARREGA AS RECUSADAS DE VOLTA, inteiras. Quem colou 300 linhas de
 * uma planilha não vai reencontrar quatro no meio dela; as quatro voltam com o
 * motivo e a tela as devolve para a caixa já preenchidas. As outras 296 entram —
 * uma importação que aborta inteira por causa de uma vírgula é uma importação
 * que a pessoa faz uma vez e desiste.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **A tela é do casal; a lista serve ao convidado.** Quem lê o recorte público
 * (`id` e `nome`) é a rota vizinha `/publico`, com outra permissão.
 */

const CAMINHO = "/api/eventos/[id]/convidados";

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "convidados.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();

  const bruto = corpo as { texto?: unknown };
  if (typeof bruto.texto !== "string") return pedidoInvalido("texto ausente");

  const leitura = lerListaColada(bruto.texto);

  /**
   * Nenhuma linha aproveitável é 400 — mas com as recusadas no corpo, para a
   * tela mostrar o motivo de cada uma. Um 400 sem detalhe faria a noiva olhar
   * para uma caixa cheia de nomes e uma mensagem genérica.
   */
  if (leitura.aceitas.length === 0) {
    return pedidoInvalido({
      recusadas: leitura.recusadas,
      excedeu: leitura.excedeu,
      maximo: MAXIMO_DE_LINHAS,
    });
  }

  const resultado = await importarConvidados(acesso.evento.id, leitura.aceitas);
  const convidados = await listarConvidados(acesso.evento.id);

  return NextResponse.json(
    {
      criados: resultado.criados,
      ja_existiam: resultado.jaExistiam,
      recusadas: leitura.recusadas,
      repetidos: leitura.repetidos,
      excedeu: leitura.excedeu,
      // As duas grandezas, separadas e NUNCA somadas: slots é o denominador da
      // North Star; pessoas é a banda do erro E1 (`metricas.md` §1.2).
      resumo: resumoDaLista(convidados),
      convidados: convidados.map(c => ({
        id: c.id,
        nome: c.nome,
        pessoas_no_slot: c.pessoasNoSlot,
        ausente: c.ausente,
      })),
    },
    { status: 201 }
  );
});
