import type { Metadata } from "next";

import { FormularioDeCadastro } from "@/components/conta/FormularioDeCadastro";

/**
 * `/cadastrar` — o cadastro público (19/08/2026).
 *
 * **ELA REVERTE A DECISÃO P4**, que dizia que este produto não tem cadastro
 * público. A decisão é do dono e está registrada na 0016 e no README; o que ela
 * troca é quem decide a porta: até aqui, o produto só tinha o casal que o dono
 * convidasse.
 *
 * `noindex` **continua valendo**. Indexar esta página seria transformá-la em
 * aquisição, e aquisição é decisão de quem divulga o endereço — não efeito
 * colateral de uma tela nova.
 */

export const metadata: Metadata = {
  title: "Criar o site de casamento",
  robots: { index: false, follow: false },
};

export default async function PaginaDeCadastro({
  searchParams,
}: {
  searchParams: Promise<{ de?: string }>;
}) {
  /**
   * `?de=<wedding_id>` é o caminho da indicação: o CTA do álbum de outro
   * casamento (`growth_cta_clicked`). Ele está desligado por dado nesta versão,
   * então na prática o parâmetro não chega — e ele é lido aqui de qualquer
   * forma, porque o dia em que o álbum voltar, o `sign_up` precisa nascer com a
   * origem certa. O GA4 não preenche o passado.
   */
  const { de } = await searchParams;
  const indicadoPor = typeof de === "string" && de.length <= 40 ? de : null;

  return <FormularioDeCadastro indicadoPor={indicadoPor} />;
}
