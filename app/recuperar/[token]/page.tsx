import type { Metadata } from "next";

import { EscolherSenhaNova } from "@/components/conta/EscolherSenhaNova";
import { ehTokenDeAcesso } from "@/lib/segredos";

/**
 * `/recuperar/[token]` — escolher a senha nova.
 *
 * O TOKEN É VALIDADO AQUI, ANTES DE QUALQUER CONSULTA. Mesma regra de `ehUuid`
 * com outro formato: 64 hexadecimais. Um token torto — e eles chegam tortos,
 * porque cliente de e-mail quebra URL longa em duas linhas — não pode custar uma
 * ida ao banco nem virar 500. Ele vira a mesma tela de "link expirado", que já
 * tem o caminho de saída.
 *
 * `noindex`: é uma credencial numa URL.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Senha nova",
  robots: { index: false, follow: false },
};

export default async function PaginaDaSenhaNova({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <EscolherSenhaNova token={ehTokenDeAcesso(token) ? token : null} />;
}
