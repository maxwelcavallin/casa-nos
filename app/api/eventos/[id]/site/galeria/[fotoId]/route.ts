import { NextResponse } from "next/server";

import {
  autorizar,
  corpoJson,
  naoEncontrado,
  pedidoInvalido,
  respostaDeErro,
  rotaDeApi,
} from "@/lib/api";
import {
  buscarFoto,
  conferirLegenda,
  definirLegenda,
  marcarFotoExcluida,
} from "@/lib/galeria";
import { ehUuid } from "@/lib/ids";
import { apagarDerivadasDaFoto } from "@/lib/r2-objetos";

/**
 * A LEGENDA E A EXCLUSÃO DE UMA FOTO (v1.0, V-19).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **OS DOIS PARÂMETROS SÃO VALIDADOS ANTES DE QUALQUER CONSULTA** (`dados.md`
 * §3). `[fotoId]` vem de uma tela de painel, mas ele também vem de um link
 * colado e de um recarregamento com a URL editada — e uuid torto estoura `22P02`
 * no Postgres, que vira 500 onde a resposta certa é 404.
 *
 * A ordem, que muda a posição de duas ou de doze fotos de uma vez, **não mora
 * aqui**: ela é um `PATCH` em lote na coleção (RV-05), pelo motivo escrito lá.
 * Este arquivo cuida do que é de uma foto só.
 *
 * `site.editar`, e **nenhuma das duas entra em `ACOES_DO_ALBUM`** (RV-23).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/eventos/[id]/site/galeria/[fotoId]";

/**
 * A LEGENDA — 80 caracteres, texto puro, **conferidos no servidor** (RV-09).
 *
 * O `CHECK` da 0015 é a segunda tranca, e não a primeira: sem esta conferência,
 * uma legenda de 96 caracteres vinda de um `PATCH` montado à mão chegaria ao
 * banco e viraria **500 de constraint** — um erro que não diz nada a quem lê e
 * que a tela não tem como traduzir em "corte 16 caracteres".
 *
 * **`null` E `""` LIMPAM A LEGENDA**, e limpar é uma edição legítima: a foto
 * volta a não ter `<figcaption>` nenhum na página. A normalização mora em
 * `conferirLegenda`, com o motivo.
 */
export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id, fotoId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(fotoId)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const campos = corpo as Record<string, unknown>;

  /**
   * **A AUSÊNCIA DO CAMPO É RECUSA, e não "não mexe em nada".** `PATCH` parcial
   * é a regra das outras rotas porque elas gravam seis campos e salvar só o link
   * não pode apagar a descrição. Aqui existe **um** campo editável: um corpo sem
   * ele é um pedido que não pede nada, e responder 200 faria a tela concluir que
   * gravou o que não gravou.
   */
  if (!("legenda" in campos)) {
    return pedidoInvalido({
      campos: [{ campo: "legenda", mensagem: "Mande a legenda, mesmo que vazia." }],
    });
  }

  const { legenda, recusa } = conferirLegenda(campos.legenda);
  if (recusa) return pedidoInvalido({ campos: [recusa] });

  // `evento_id` no `where`: foto de outro casamento devolve `null`, que vira
  // 404 — nunca 403, porque 403 confirmaria que ela existe.
  const foto = await definirLegenda(acesso.evento.id, fotoId, legenda);
  if (!foto) return naoEncontrado();

  return NextResponse.json({ id: foto.id, legenda: foto.legenda, ordem: foto.ordem });
});

/**
 * APAGAR — **o objeto sai do balde primeiro; a linha é marcada depois** (RV-22).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * É A ÚNICA EXCLUSÃO DESTA VERSÃO QUE APAGA BYTE, e a ordem dos dois passos é o
 * requisito, não um detalhe de implementação:
 *
 *   1. `buscarFoto`              → 404 **antes de tocar no balde**. Apagar
 *                                  objeto de uma foto que não é deste casamento
 *                                  seria a pior ordem possível dos dois passos.
 *   2. `apagarDerivadasDaFoto`   → os dois JPEG saem de `pub/`. Falhou: **502, e
 *                                  a linha fica intacta**.
 *   3. `marcarFotoExcluida`      → só agora a linha diz "apagada".
 *
 * **NUNCA UMA LINHA QUE DIZ "APAGADA" SOBRE UM ARQUIVO QUE CONTINUA
 * RESPONDENDO**, porque a confirmação de tirar o site do ar passa a prometer, com
 * todas as letras, que apagar a foto é o jeito de tirá-la do ar de vez (RV-21).
 * Uma frase verdadeira em um só dos dois lugares é uma frase falsa.
 *
 * **A JANELA QUE SOBRA, ESCRITA EM VEZ DE DESCOBERTA:** entre os passos 2 e 3 o
 * processo pode morrer (a plataforma encerra a função). Nesse instante o arquivo
 * já saiu e a linha ainda está viva — e o site renderiza uma `<img>` para um
 * endereço que responde 404, que é uma foto quebrada na página do casamento.
 * Ela é a menos ruim das duas janelas possíveis, e **tem conserto de um toque**:
 * apagar de novo. `apagar()` trata 404 como "não está mais lá", então a segunda
 * passada atravessa o balde sem fazer nada e marca a linha. A mensagem de erro
 * da tela diz exatamente isso, em vez de "erro ao apagar".
 *
 * NÃO HÁ CARÊNCIA DE 30 DIAS, ao contrário do álbum, e o motivo está em
 * `lib/galeria.ts`: o original da foto da galeria está no celular do casal.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const DELETE = rotaDeApi(CAMINHO, async (_pedido, contexto) => {
  const { id, fotoId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(fotoId)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const foto = await buscarFoto(acesso.evento.id, fotoId);
  if (!foto) return naoEncontrado();

  if (!(await apagarDerivadasDaFoto(acesso.evento.id, fotoId))) {
    /**
     * 502 e não 500: quem recusou foi o balde, e não este servidor. A distinção
     * importa para quem investiga — 500 manda olhar o código desta rota, e o
     * problema está a um `fetch` de distância.
     */
    return respostaDeErro(502, "armazenamento recusou apagar");
  }

  const apagou = await marcarFotoExcluida(acesso.evento.id, fotoId);
  if (!apagou) return naoEncontrado();

  return new NextResponse(null, { status: 204 });
});
