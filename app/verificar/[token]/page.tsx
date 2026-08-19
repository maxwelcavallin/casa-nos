import type { Metadata } from "next";

import { ConfirmarEmail } from "@/components/conta/ConfirmarEmail";
import { ehTokenDeAcesso } from "@/lib/segredos";

/**
 * `/verificar/[token]` — a confirmação do e-mail do cadastro.
 *
 * Mesma regra de formato de `/recuperar/[token]`, e o mesmo `noindex`: a URL é
 * uma credencial de uso único.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmar e-mail",
  robots: { index: false, follow: false },
};

export default async function PaginaDeVerificacao({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ConfirmarEmail token={ehTokenDeAcesso(token) ? token : null} />;
}
