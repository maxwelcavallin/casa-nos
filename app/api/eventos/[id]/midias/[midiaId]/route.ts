import { NextResponse } from "next/server";

import { autorizar, naoEncontrado, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import { excluirMidia } from "@/lib/midias";
import { participacaoDaSessao } from "@/lib/sessao";

/**
 * APAGAR UMA FOTO (H-10, H-14).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOIS CAMINHOS COM A MESMA ROTA, SEPARADOS PELO **ALCANCE** DA MATRIZ — e não
 * por um `if` sobre o tipo de sessão (que `test/autorizacao-matriz.test.ts`
 * varre e proíbe):
 *
 *   `proprias` → quem enviou. `participacao_id` entra na cláusula.
 *   `todas`    → o casal (e o dono). A cláusula é só o evento.
 *
 * O MODERADOR NÃO APARECE em nenhum dos dois, e a ausência é a regra: ele
 * **modera e não exclui** (PRD §7, assimetria 2). Foi designado para decidir o
 * que aparece na parede, não o que o casal guarda. Ele recebe 403 aqui.
 *
 * O valor de `excluida_por` sai do MESMO alcance, e é por isso que ele não
 * precisa de um `if` de perfil: `proprias` só existe para o convidado.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **UM TOQUE, SEM CONFIRMAÇÃO EM DOIS PASSOS** (H-10). A rota reflete isso: não
 * há `?confirmar=true`, não há dois passos, não há nada a confirmar. A rede de
 * segurança é o *Desfazer* do toast na tela, e a exclusão é **lógica** — o
 * objeto no R2 é apagado depois de 30 dias de carência (RN-20), no cron da F1.6.
 *
 * E o texto da tela diz o limite honesto, que esta rota não pode cumprir:
 * a foto sai do produto; ela **não** sai do telão que já a exibiu, nem do print
 * de quem tirou.
 */

const CAMINHO = "/api/eventos/[id]/midias/[midiaId]";

export const DELETE = rotaDeApi(CAMINHO, async (_pedido, contexto) => {
  const { id, midiaId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(midiaId)) return naoEncontrado();

  const acesso = await autorizar(id, "midia.excluir");
  if (!acesso.ok) return acesso.resposta;

  const participacao = participacaoDaSessao(acesso.sessao);
  const proprias = acesso.alcance === "proprias";

  // Alcance `proprias` sem participação é um estado que a matriz não produz —
  // mas se produzir um dia, o lado seguro de errar é 404, e não "apaga tudo".
  if (proprias && !participacao) return naoEncontrado();

  const apagada = await excluirMidia(
    acesso.evento.id,
    midiaId,
    proprias ? "convidado" : "casal",
    proprias ? participacao!.id : null
  );
  if (!apagada) return naoEncontrado();

  return new NextResponse(null, { status: 204 });
});
