import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PaginaDoEvento } from "@/components/evento/PaginaDoEvento";
import { recortePublico } from "@/lib/eventos";
import { metadadosDoEvento } from "@/lib/metadados";
import { eventoDaRequisicao } from "@/lib/resolver-evento";
import { montarSite } from "@/lib/site-publico";

/**
 * A raiz — o site do casamento cujo domínio o visitante digitou.
 *
 * `force-dynamic` porque a resposta depende do domínio da requisição E da
 * contagem regressiva: uma página estatizada serviria o casamento do primeiro
 * domínio que fosse compilado, para todos os outros domínios, com uma contagem
 * congelada no horário do build. É o tipo de bug que só aparece com o segundo
 * inquilino no ar.
 *
 * O QUE ELA DECIDE É **QUAL** EVENTO. Como ele aparece — quais seções, em que
 * ordem, com que conteúdo — é `montarSite`, e é a mesma função que a prévia
 * usa (V-10). A cópia deste bloco em três telas foi o que a V-10 tirou daqui:
 * ela era o único jeito de a prévia mentir.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const evento = await eventoDaRequisicao();
  if (!evento) return { title: "casa-nos" };
  return metadadosDoEvento(recortePublico(evento));
}

export default async function Raiz() {
  const evento = await eventoDaRequisicao();
  if (!evento) notFound();

  const dados = await montarSite(evento);
  return <PaginaDoEvento {...dados} />;
}
