import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PaginaDoEvento } from "@/components/evento/PaginaDoEvento";
import { agoraNoServidor } from "@/lib/datas";
import { listarIndicacoes, recortePublico } from "@/lib/eventos";
import { metadadosDoEvento } from "@/lib/metadados";
import { chavesLigadas, listarSecoes } from "@/lib/secoes";
import { eventoDaRequisicao } from "@/lib/resolver-evento";

/**
 * A raiz — o site do casamento cujo domínio o visitante digitou.
 *
 * `force-dynamic` porque a resposta depende do domínio da requisição E da
 * contagem regressiva: uma página estatizada serviria o casamento do primeiro
 * domínio que fosse compilado, para todos os outros domínios, com uma contagem
 * congelada no horário do build. É o tipo de bug que só aparece com o segundo
 * inquilino no ar.
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
      // O "agora" do servidor vai junto para a primeira pintura do cliente ser
      // idêntica à do servidor. Ver o comentário em ContagemRegressiva.
      agoraMs={agoraNoServidor().getTime()}
      secoes={ligadas}
    />
  );
}
