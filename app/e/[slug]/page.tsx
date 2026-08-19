import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PaginaDoEvento } from "@/components/evento/PaginaDoEvento";
import { recortePublico } from "@/lib/eventos";
import { ehSlug } from "@/lib/ids";
import { metadadosDoEvento } from "@/lib/metadados";
import { eventoPorSlug } from "@/lib/resolver-evento";
import { montarSite } from "@/lib/site-publico";

/**
 * O mesmo site, endereçado pelo slug: `/e/ana-e-max`.
 *
 * PARA QUE SERVE: é como o casal vê o site antes de o DNS apontar, e é como um
 * segundo casamento existe no mesmo deploy enquanto o domínio dele não chega.
 * A página é a mesma — quem muda é só o degrau que resolve o inquilino.
 *
 * **ELA EXIGE `publicado = true`**, porque `buscarEventoPorSlug` exige. É daí
 * que nasce a V-10: até a prévia existir, um site despublicado não era visível
 * para ninguém — nem para o casal —, e o único jeito de conferir o resultado
 * era publicar, ou seja, descobrir o erro com 150 pessoas com o link na mão.
 *
 * `ehSlug` ANTES de consultar: parâmetro de URL é entrada de estranho. Sem o
 * filtro, qualquer texto vira consulta ao banco — e é assim que id malformado
 * vira 500 em vez de 404 no resto do produto (regra §3 de `dados.md`). Aqui o
 * ganho extra é que varrer o endereço fica caro para quem tentar.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!ehSlug(slug)) return { title: "casa-nos" };

  const evento = await eventoPorSlug(slug);
  if (!evento) return { title: "casa-nos" };

  return metadadosDoEvento(recortePublico(evento));
}

export default async function PaginaPorSlug({ params }: Props) {
  const { slug } = await params;
  if (!ehSlug(slug)) notFound();

  const evento = await eventoPorSlug(slug);
  if (!evento) notFound();

  const dados = await montarSite(evento);
  return <PaginaDoEvento {...dados} />;
}
