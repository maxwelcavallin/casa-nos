import type { Metadata } from "next";

import { EntrarNoPainel } from "@/components/painel/EntrarNoPainel";
import { ehTokenDeAcesso } from "@/lib/segredos";

/**
 * `/entrar/[token]` (H-02).
 *
 * O TOKEN É VALIDADO AQUI, ANTES DE QUALQUER CONSULTA. É a mesma regra de
 * `ehUuid` (`dados.md` §3) com outro formato: 64 caracteres hexadecimais. Um
 * token torto — e eles chegam tortos, porque cliente de e-mail quebra URL longa
 * em duas linhas — não pode custar uma ida ao banco, e não pode virar 500.
 *
 * O que ele vira é a MESMA tela de link expirado, que já tem o caminho de saída.
 * Distinguir "malformado" de "expirado" não ajudaria ninguém: a ação é a mesma,
 * e o que aconteceu com o link não é problema de quem clicou.
 *
 * `noindex`: é uma credencial numa URL. Ela não entra em índice nenhum.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Título literal, sem nome de casal e sem data (RN-31): esta URL é uma
  // credencial, e o título dela viaja para todo lugar que o navegador leva.
  title: "Entrar",
  robots: { index: false, follow: false },
};

export default async function PaginaDeEntrada({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <EntrarNoPainel token={ehTokenDeAcesso(token) ? token : null} />;
}
