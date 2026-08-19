import type { Metadata } from "next";

import { FormularioDeEntrada } from "@/components/conta/FormularioDeEntrada";

/**
 * `/entrar` — a porta do painel desde 19/08/2026.
 *
 * O que existia aqui era `/entrar/[token]`, a ponta do link mágico. A pasta com
 * o parâmetro saiu junto com ele; esta página não tem parâmetro nenhum, e é a
 * mesma tela para todo mundo.
 *
 * `noindex`: é a porta de serviço do produto, não uma página de venda.
 */

export const metadata: Metadata = {
  // Título literal (RN-31): sem nome de casal, sem data. Quem abre esta tela
  // ainda não é ninguém, e o produto não sabe qual casamento é o dele.
  title: "Entrar",
  robots: { index: false, follow: false },
};

export default function PaginaDeEntrada() {
  return <FormularioDeEntrada />;
}
