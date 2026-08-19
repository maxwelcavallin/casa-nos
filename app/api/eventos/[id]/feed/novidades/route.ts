import { NextResponse } from "next/server";

import { autorizar, naoEncontrado, rotaDeApi } from "@/lib/api";
import { novidadesDoFeed } from "@/lib/feed";
import { ehUuid } from "@/lib/ids";

/**
 * A SONDAGEM BARATA (H-11) — um número e um instante, e mais nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ARITMÉTICA QUE JUSTIFICA O DESENHO: 200 convidados perguntando a cada 5 s
 * são 40 requisições por segundo. Se cada uma devolvesse uma página de fotos, o
 * banco atenderia 40 consultas paginadas por segundo a noite inteira — e o
 * uplink do salão carregaria 40 páginas de miniaturas que ninguém pediu.
 *
 * Devolvendo só `quantas` e `ate`, sobra uma **contagem sobre o índice parcial
 * do feed** (`midias_feed_idx`), que é a consulta mais barata que este produto
 * tem. 40 delas por segundo é trabalho de rotina para o Neon.
 *
 * **E O CACHE DE BORDA FICOU DE FORA, de propósito.** A H-11 autoriza 5 a 10 s
 * de cache de borda, e a resposta de fato é idêntica para todo mundo do mesmo
 * evento. Mas `cache-control: public` numa rota que só responde com sessão é
 * exatamente como uma resposta autenticada passa a ser servida a quem não tem
 * sessão: a borda guarda pela URL, e a URL não carrega o cookie. O ganho seria
 * trocar 40 consultas baratas por uma; o risco é uma rota de inquilino
 * respondendo sem inquilino. **Fica `private`, e a otimização volta com número
 * do teste de carga (H-21) e com uma variante sem sessão, se ela for
 * necessária.**
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A SONDAGEM SÓ RODA COM A ABA VISÍVEL (o cliente decide, ver `useFeed`). Uma
 * aba de fundo perguntando a noite inteira gasta a bateria de um aparelho que o
 * convidado precisa que dure — e que é o mesmo aparelho que ainda tem fotos na
 * fila.
 *
 * ELA NÃO EMPURRA A TELA. O cliente usa o número no botão "12 fotos novas" no
 * topo; quem decide quando as fotos entram é quem está olhando, não o servidor.
 */

const CAMINHO = "/api/eventos/[id]/feed/novidades";

export const GET = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "feed.ver");
  if (!acesso.ok) return acesso.resposta;

  const bruto = new URL(pedido.url).searchParams.get("desde");
  const instante = bruto ? new Date(bruto) : null;
  // Marca de tempo torta vira "desde o começo", e não erro: o cliente pode ter
  // acabado de ser instalado, ou o parâmetro pode ter vindo de um link colado.
  const desde = instante && !Number.isNaN(instante.getTime()) ? instante : null;

  const novidades = await novidadesDoFeed(acesso.evento.id, desde);

  return NextResponse.json(novidades, {
    // `private`: o navegador pode reaproveitar por 5 s (é o intervalo da própria
    // sondagem), e nenhuma borda compartilhada guarda uma resposta que só existe
    // com sessão. Ver o comentário do topo.
    headers: { "cache-control": "private, max-age=5" },
  });
});
