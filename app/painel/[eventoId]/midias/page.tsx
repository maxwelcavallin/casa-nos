import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FotosQueChegaram } from "@/components/painel/FotosQueChegaram";
import { podeNoEvento } from "@/lib/autorizacao";
import { agoraNoServidor } from "@/lib/datas";
import { buscarEventoPorId } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { diasDesdeOEvento } from "@/lib/medida-do-dia";
import { sessaoDoEvento, usuarioPseudonimo } from "@/lib/sessao";

/**
 * `/painel/[eventoId]/midias` (H-14) — **casal e moderador (sem excluir)**.
 *
 * O moderador vê esta tela sem o botão de apagar e sem o de baixar: ele modera,
 * não guarda (PRD §7, assimetria 2). A tela não oferece o que a rota nega — um
 * botão que devolve 403 é pior que um botão ausente.
 *
 * **AS TRÊS DECISÕES DE TEMPO SÃO TOMADAS AQUI, NO SERVIDOR**, e viajam como
 * booleano para a tela: se a festa já acabou (decide o aviso de rótulos
 * repetidos, H-23), se ela ainda não começou (decide o vazio de lista de
 * preparo) e há quantos dias ela foi (`days_since_event`). As três dependem do
 * **fuso do evento** — calculadas no cliente, elas usariam o relógio do
 * computador de quem abriu, e entre 21h e meia-noite isso é o dia seguinte
 * (`dados.md` §4).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Literal, sem interpolar nome de casal nem de convidado (RN-31).
  title: "O que chegou",
  robots: { index: false, follow: false },
};

export default async function PaginaDeMidias({
  params,
}: {
  params: Promise<{ eventoId: string }>;
}) {
  const { eventoId } = await params;
  if (!ehUuid(eventoId)) notFound();

  const evento = await buscarEventoPorId(eventoId);
  if (!evento) notFound();

  const sessao = await sessaoDoEvento(evento.id);
  if (podeNoEvento(sessao, "midia.ver.todas", evento) === "nao") notFound();

  const agora = agoraNoServidor();

  return (
    <FotosQueChegaram
      eventoId={evento.id}
      ehDono={podeNoEvento(sessao, "medicao.ver", evento) !== "nao"}
      podeExcluir={podeNoEvento(sessao, "midia.excluir", evento) !== "nao"}
      /**
       * Sem `fim_festa_em` configurado o aviso **não aparece**, e é o lado certo
       * de errar: a H-23 diz "nunca durante a festa", e sem os carimbos não há
       * como saber se é durante. Mostrar seria arriscar o exato comportamento
       * que a história proíbe.
       */
      festaAcabou={evento.fimFestaEm !== null && agora > evento.fimFestaEm}
      antesDaFesta={evento.inicioFestaEm !== null && agora < evento.inicioFestaEm}
      diasDesdeOEvento={diasDesdeOEvento(evento, agora)}
      usuario={usuarioPseudonimo(sessao)}
    />
  );
}
