import { sql, type Executor } from "@/lib/db";
import {
  buscarMidia,
  trocarVisibilidade,
  type TrocaDeVisibilidade,
  type Visibilidade,
} from "@/lib/midias";
import { registrarErro } from "@/lib/observabilidade";
import {
  abrirDerivadas,
  clienteR2,
  limparRestosPrivados,
  restringirDerivadas,
  type ClienteDeObjetos,
  type MotivoDaFalha,
} from "@/lib/r2-objetos";

/**
 * A TROCA DE VISIBILIDADE, INTEIRA — banco e balde, nesta ordem e não em outra
 * (H-10, RN-33).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O PROBLEMA QUE ESTE ARQUIVO RESOLVE, dito sem eufemismo: até a decisão do `po`
 * de 19/08/2026, trocar uma foto de `feed` para `noivos` mudava **uma coluna**.
 * O objeto continuava no endereço público de antes, e quem tivesse aquele
 * endereço continuava vendo a foto — para sempre. O produto imprime
 * **"Só os noivos veem esta foto"** na tela, e essa é a hipótese central que a
 * Fatia 1 existe para medir. Uma promessa que depende de ninguém ter guardado a
 * URL não é uma promessa.
 *
 * AGORA A TROCA É UMA COREOGRAFIA, E O BANCO É O ÚLTIMO PASSO AO RESTRINGIR:
 *
 *   feed → noivos   copiar para `prv/` · apagar de `pub/` · purgar a borda ·
 *                   **conferir que o endereço público parou de responder** ·
 *                   só então escrever a coluna
 *   noivos → feed   copiar para `pub/` · escrever a coluna · recolher `prv/`
 *
 * **Se o movimento falhar, a troca falha inteira** e a coluna não muda. É o que
 * a H-10 já mandava fazer, e é o que faz a mensagem de erro dela ser verdadeira:
 * *"Não conseguimos mudar agora. Continua na festa."* — continua mesmo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `trocarVisibilidade` continua sendo o **único** caminho de escrita de
 * `midias.visibilidade` no produto inteiro (PRD §3.2, P2), e este arquivo é o
 * único que o chama. A catraca de `test/minhas-e-visibilidade.test.ts` guarda a
 * primeira metade; `test/visibilidade-move-objetos.test.ts` guarda esta.
 */

export type FalhaDaTroca = { falhou: true; motivo: MotivoDaFalha | "nao_encontrada" };

export type ResultadoDaTroca = TrocaDeVisibilidade | FalhaDaTroca;

export function trocaFalhou(resultado: ResultadoDaTroca): resultado is FalhaDaTroca {
  return "falhou" in resultado;
}

export async function mudarVisibilidadeDaMidia(
  eventoId: string,
  midiaId: string,
  participacaoId: string,
  nova: Visibilidade,
  opcoes: { cliente?: ClienteDeObjetos | null; exec?: Executor } = {}
): Promise<ResultadoDaTroca> {
  const exec = opcoes.exec ?? sql;
  const cliente = opcoes.cliente === undefined ? clienteR2() : opcoes.cliente;

  const atual = await buscarMidia(eventoId, midiaId, participacaoId, exec);
  // Mídia de outra participação, de outro evento, ou já excluída: os três casos
  // dão a mesma resposta, e quem chama devolve 404 — 403 confirmaria que a mídia
  // existe.
  if (!atual) return { falhou: true, motivo: "nao_encontrada" };

  if (atual.visibilidade === nova) {
    return { midia: atual, de: atual.visibilidade, mudou: false };
  }

  if (nova === "noivos") {
    const movimento = await restringirDerivadas(eventoId, midiaId, cliente);
    if (!movimento.ok) {
      /**
       * Uma troca recusada por causa do balde é informação, não rotina: ela
       * significa que alguém pediu privacidade e o produto **não conseguiu
       * entregar**. Sem este registro, o sintoma seria um toast de erro no
       * celular de uma convidada, às 23h, e nada em lugar nenhum.
       */
      await registrarErro(
        {
          origem: "servidor",
          rota: "/api/eventos/[id]/midias/[midiaId]/visibilidade",
          sessaoTipo: "convidado",
          eventoId,
          midiaId,
          tipoErro: "servidor",
          classe: `visibilidade.${movimento.motivo}`,
          mensagem: `nao consegui fechar o endereco publico da midia (${movimento.motivo})`,
          httpStatus: 503,
        },
        exec
      );
      return { falhou: true, motivo: movimento.motivo };
    }

    const troca = await trocarVisibilidade(eventoId, midiaId, participacaoId, nova, exec);
    return troca ?? { falhou: true, motivo: "nao_encontrada" };
  }

  // Abrindo. Copia primeiro — a foto precisa estar de pé no lado público antes
  // de o feed passar a apontar para lá, senão a grade mostra um tile quebrado.
  const movimento = await abrirDerivadas(eventoId, midiaId, cliente);
  if (!movimento.ok) return { falhou: true, motivo: movimento.motivo };

  const troca = await trocarVisibilidade(eventoId, midiaId, participacaoId, nova, exec);
  if (!troca) return { falhou: true, motivo: "nao_encontrada" };

  // Só depois do banco. Lixo em `prv/` é o erro barato; o cron do H-15 recolhe.
  await limparRestosPrivados(eventoId, midiaId, cliente);
  return troca;
}
