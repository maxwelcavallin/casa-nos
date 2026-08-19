import { NextResponse } from "next/server";

import { autorizar, naoEncontrado, rotaDeApi } from "@/lib/api";
import { listarConvidadosPublicos } from "@/lib/convidados";
import { ehUuid } from "@/lib/ids";

/**
 * A LISTA QUE O ÁLBUM LÊ — **só `id` e `nome`** (H-03, H-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTA ROTA NÃO DEVOLVE, e cada ausência é uma decisão:
 *
 * - `pessoas_no_slot` — quantas pessoas o casal contou na mesa de alguém não é
 *   assunto do convidado.
 * - `ausente` — quem faltou na festa é dado do casal, e depois da festa.
 * - qualquer coisa de participação — quem já reivindicou um nome. **Não existe
 *   "alguém já é você"** (RN-23), e devolver a informação seria a primeira pedra
 *   do caminho que leva a esse estado.
 *
 * O recorte é feito na CONSULTA, não na serialização (`lib/convidados.ts`): com
 * `select *` os outros campos chegariam à memória do processo e a próxima pessoa
 * a mexer aqui os teria à mão para "aproveitar".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ELA É SERVIDA INTEIRA, UMA VEZ (decisão P7): até 300 slots num JSON de poucos
 * quilobytes. A busca acontece no cliente, com dobra de acento em JavaScript.
 * Isso evita a extensão `unaccent` (o ADR 0001 é explícito), evita índice de
 * busca e — o que vale mais — **deixa a identificação funcionar offline**,
 * porque o service worker guarda a resposta. No salão sem rede, é a diferença
 * entre o nome ser escolhido e o nome ser digitado.
 *
 * A CONSEQUÊNCIA ACEITA, escrita: quem tem o link do álbum vê os nomes da lista.
 * O link já é credencial ao portador (B14), e esta rota exige participação
 * ativa — mas a lista de convidados de um casamento é, ela mesma, um dado
 * pessoal de terceiros, e isso está aceito de olhos abertos, não por descuido.
 */

const CAMINHO = "/api/eventos/[id]/convidados/publico";

export const GET = rotaDeApi(CAMINHO, async (_pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "convidados.ver.publico");
  if (!acesso.ok) return acesso.resposta;

  const convidados = await listarConvidadosPublicos(acesso.evento.id);

  return NextResponse.json(
    { convidados },
    {
      /**
       * Cache curto e PRIVADO. A lista muda pouco (o casal cola uma vez), e no
       * salão cada ida à rede conta. `private` porque o conteúdo é de um
       * inquilino só: um cache compartilhado de borda serviria a lista de um
       * casamento a quem abriu outro.
       */
      headers: { "cache-control": "private, max-age=300" },
    }
  );
});
