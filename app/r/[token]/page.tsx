import type { Metadata } from "next";

import { RetomarAlbum } from "@/components/album/RetomarAlbum";
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
  return <RetomarAlbum token={ehTokenDeAcesso(token) ? token : null} />;
}
