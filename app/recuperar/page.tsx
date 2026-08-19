import type { Metadata } from "next";

import { PedirSenhaNova } from "@/components/conta/PedirSenhaNova";

/** `/recuperar` — pedir o link da senha nova. */

export const metadata: Metadata = {
  title: "Senha nova",
  robots: { index: false, follow: false },
};

export default function PaginaDeRecuperacao() {
  return <PedirSenhaNova />;
}
