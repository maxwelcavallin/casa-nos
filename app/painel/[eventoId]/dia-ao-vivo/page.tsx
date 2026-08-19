import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DiaAoVivo } from "@/components/painel/DiaAoVivo";
import { pode } from "@/lib/autorizacao";
import { buscarEventoPorId } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { sessaoDoEvento, usuarioPseudonimo } from "@/lib/sessao";

/**
 * `/painel/[eventoId]/dia-ao-vivo` (H-19) — **só o dono**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA É A SEXTA ROTA DO PAINEL E A QUINTA TELA DO CASAL — as duas contagens
 * estão certas, e elas contam coisas diferentes (PRD §6.2). **Esta tela não é do
 * casal.** Ela tem permissão própria (`medicao.ver`, uma linha na matriz), selo
 * "visão do dono" e **nenhum link a partir do painel do casal**.
 *
 * A ausência do link é conteúdo, não esquecimento: a promessa do produto é que o
 * casal não trabalhe durante a própria festa, e isso inclui não olhar painel.
 * Uma tela de medição linkada dentro do painel dele seria o produto convidando
 * exatamente o comportamento que promete evitar.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `notFound()` e não 403: quem não é dono não precisa saber que esta tela
 * existe.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "O dia ao vivo",
  robots: { index: false, follow: false },
};

export default async function PaginaDoDiaAoVivo({
  params,
}: {
  params: Promise<{ eventoId: string }>;
}) {
  const { eventoId } = await params;
  if (!ehUuid(eventoId)) notFound();

  const evento = await buscarEventoPorId(eventoId);
  if (!evento) notFound();

  const sessao = await sessaoDoEvento(evento.id);
  if (pode(sessao, "medicao.ver") === "nao") notFound();

  return <DiaAoVivo eventoId={evento.id} usuario={usuarioPseudonimo(sessao)} />;
}
