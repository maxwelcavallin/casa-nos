import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PainelDoSite, type LinhaDeSecao } from "@/components/painel/site/PainelDoSite";
import { podeNoEvento } from "@/lib/autorizacao";
import {
  buscarHistoria,
  listarPerguntas,
  listarProgramacao,
} from "@/lib/conteudo-do-site";
import { buscarEventoPorId } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { listarIndicacoesDoPainel } from "@/lib/indicacoes";
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

  /**
   * O PAINEL BUSCA TUDO, ao contrário do site.
   *
   * A diferença é a que importa: a página pública **não busca** o conteúdo de
   * seção desligada (RV-01), porque ali ele viajaria no HTML para o convidado.
   * Aqui quem lê é o casal, e ele precisa ver o que desligou para poder religar
   * — esconder do dono o que ele mesmo escreveu seria a única forma de tornar o
   * liga/desliga assustador.
   *
   * `listarIndicacoesDoPainel` e `listarPerguntas` incluem, pelo mesmo motivo, o
   * que o site não mostra: indicação não publicada e pergunta sem resposta.
   */
  const [secoes, indicacoes, historia, programacao, perguntas] = await Promise.all([
    listarSecoes(evento.id),
    listarIndicacoesDoPainel(evento.id),
    buscarHistoria(evento.id),
    listarProgramacao(evento.id),
    listarPerguntas(evento.id),
  ]);

  const conteudo: ContagemDoConteudo = {
    indicacoes: indicacoes.length,
    programacao: programacao.length,
    // Só as RESPONDIDAS contam como preenchidas: pergunta sem resposta não
    // renderiza no site (RV-02), e contá-la faria o painel dizer que a seção
    // está pronta enquanto o convidado não vê nada.
    perguntasRespondidas: perguntas.filter(p => p.resposta !== null).length,
    perguntasTotal: perguntas.length,
    historiaTemTexto: historia !== null && historia.texto.trim() !== "",
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
