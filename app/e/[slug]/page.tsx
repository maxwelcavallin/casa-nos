import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PaginaDoEvento } from "@/components/evento/PaginaDoEvento";
import { agoraNoServidor } from "@/lib/datas";
import { listarIndicacoes, recortePublico } from "@/lib/eventos";
import { ehSlug } from "@/lib/ids";
import { metadadosDoEvento } from "@/lib/metadados";
import { chavesLigadas, listarSecoes } from "@/lib/secoes";
import { eventoPorSlug } from "@/lib/resolver-evento";

/**
 * O mesmo site, endereçado pelo slug: `/e/ana-e-max`.
 *
 * PARA QUE SERVE: é como o casal vê o site antes de o DNS apontar, e é como um
 * segundo casamento existe no mesmo deploy enquanto o domínio dele não chega.
 * A página é a mesma — quem muda é só o degrau que resolve o inquilino.
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

  const secoes = await listarSecoes(evento.id);
  const ligadas = chavesLigadas(secoes);

  /**
   * **O CONTEÚDO DE SEÇÃO DESLIGADA NÃO É NEM BUSCADO** (RV-01). Não é economia
   * de consulta: é o que faz o texto não existir no HTML. Esconder na
   * renderização deixaria o conteúdo no código-fonte da página, e o primeiro
   * convidado curioso leria o que o casal decidiu não contar.
   */
  const indicacoes = ligadas.includes("indicacoes") ? await listarIndicacoes(evento.id) : [];

  return (
    <PaginaDoEvento
      evento={recortePublico(evento)}
      indicacoes={indicacoes}
      agoraMs={agoraNoServidor().getTime()}
      secoes={ligadas}
    />
  );
}
