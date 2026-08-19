import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PainelDoSite, type LinhaDeSecao } from "@/components/painel/site/PainelDoSite";
import { podeNoEvento } from "@/lib/autorizacao";
import { buscarEventoPorId, listarIndicacoes } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { resumirSecao, type ContagemDoConteudo } from "@/lib/resumo-do-site";
import { listarSecoes, SECOES_COM_EDITOR } from "@/lib/secoes";
import { sessaoDoEvento } from "@/lib/sessao";

/**
 * `/painel/[eventoId]/site` — a casa do editor (v1.0, V-02).
 *
 * **404 E NÃO 403** quando a sessão não pode editar este site: o casal do
 * casamento A que receber o link do painel do casamento B não pode nem descobrir
 * que aquele id existe. É a mesma regra das outras sete telas de painel.
 *
 * COMPONENTE DE SERVIDOR, sem rota `GET`. Ele lê direto de `lib/`, como as telas
 * de painel que já existem — e por isso esta tela **não tem estado de
 * carregamento**: não há busca no cliente que possa ficar pendurada. Se um dia
 * houver, o esqueleto entra junto com ela.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Título literal (RN-31): sem nome de casal, sem data. O nome deles aparece na
  // tela, onde identifica; no título ele viaja para o histórico do navegador.
  title: "O site do casamento",
  robots: { index: false, follow: false },
};

export default async function PaginaDoSite({
  params,
}: {
  params: Promise<{ eventoId: string }>;
}) {
  const { eventoId } = await params;
  // Antes de qualquer consulta (`dados.md` §3).
  if (!ehUuid(eventoId)) notFound();

  const evento = await buscarEventoPorId(eventoId);
  if (!evento) notFound();

  const sessao = await sessaoDoEvento(evento.id);
  if (podeNoEvento(sessao, "site.editar", evento) === "nao") notFound();

  const [secoes, indicacoes] = await Promise.all([
    listarSecoes(evento.id),
    listarIndicacoes(evento.id),
  ]);

  /**
   * As três seções da `0013` ainda não têm conteúdo aqui — elas entram na V1.4.
   * Enquanto isso, o resumo delas diz a verdade ("sem texto ainda") e a marca
   * de "falta preencher" aparece, que é exatamente o estado real: ligada, vazia
   * e portanto invisível no site (RV-02).
   */
  const conteudo: ContagemDoConteudo = {
    indicacoes: indicacoes.length,
    programacao: 0,
    perguntasRespondidas: 0,
    perguntasTotal: 0,
    historiaTemTexto: false,
  };

  const linhas: LinhaDeSecao[] = secoes.map(secao => {
    const resumo = resumirSecao(secao.chave, evento, conteudo);
    return {
      chave: secao.chave,
      nome: secao.nome,
      explicacao: secao.explicacao,
      resumo: resumo.texto,
      faltaPreencher: resumo.faltaPreencher,
      podeDesligar: secao.podeDesligar,
      temEditor: SECOES_COM_EDITOR.has(secao.chave),
      fixa: secao.posicaoFixa !== null,
      ativa: secao.ativa,
      ordem: secao.ordem,
    };
  });

  return (
    <PainelDoSite
      dados={{
        eventoId: evento.id,
        nomeCasal: evento.nomeCasal,
        slug: evento.slug,
        publicado: evento.publicado,
        // O selo do dono NÃO sai de `medicao.ver`: aquela ação é do álbum e
        // responde `nao` com a flag desligada, o que apagaria o selo justamente
        // na v1.0. Sai do próprio acesso, como na tela do dia.
        ehDono: sessao.tipo === "casal" && sessao.acesso.dono,
        secoes: linhas,
      }}
    />
  );
}
