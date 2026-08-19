import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RetomarAlbum } from "@/components/album/RetomarAlbum";
import { buscarEventoPorId } from "@/lib/eventos";
import { eventoDoLinkGuardado } from "@/lib/participacoes";
import { ehTokenDeAcesso } from "@/lib/segredos";

/**
 * `/r/[token]` — o link guardado aberto noutro aparelho (H-22).
 *
 * O FORMATO É CONFERIDO AQUI, ANTES DE QUALQUER COISA (`dados.md` §3, e é o que
 * `test/rotas-id-validado.test.ts` varre): este token chega de um link colado
 * num WhatsApp, e cliente de mensagem quebra URL longa em duas linhas. Token
 * torto vira `null` e a tela mostra "Este link não vale mais" — nunca 500, e
 * nunca uma ida ao banco.
 *
 * **`noindex`**, como todas as telas de álbum: o endereço é uma credencial ao
 * portador, e um índice de busca guardando isto seria o pior vazamento possível
 * deste produto.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Literal. Nome de casal e de convidado não entram em título de aba (RN-31).
  title: "As minhas fotos",
  robots: { index: false, follow: false },
};

export default async function PaginaDoLinkGuardado({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valido = ehTokenDeAcesso(token) ? token : null;

  /**
   * ÁLBUM DESLIGADO É 404 (v1.0, V-01) — e descobrir de qual casamento este link
   * é custa uma LEITURA, nunca a escrita.
   *
   * `eventoDoLinkGuardado` é a irmã só-leitura de `participacaoPorLinkGuardado`.
   * A segunda é um `UPDATE` que marca `retomado`, e chamá-la aqui carimbaria a
   * participação na pré-visualização do WhatsApp, antes de a pessoa tocar no
   * link — o defeito clássico de link mágico.
   *
   * Token que não acerta nada NÃO vira 404: a tela continua dizendo "este link
   * não vale mais", que é o que ela já dizia. Um 404 ali informaria a quem está
   * adivinhando token que os outros palpites erraram por outro motivo.
   */
  if (valido) {
    const vinculo = await eventoDoLinkGuardado(valido);
    if (vinculo) {
      const evento = await buscarEventoPorId(vinculo.eventoId);
      if (!evento || !evento.albumAtivo) notFound();
    }
  }

  return <RetomarAlbum token={valido} />;
}
