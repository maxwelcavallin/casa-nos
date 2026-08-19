import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FilaDeAprovacao } from "@/components/painel/FilaDeAprovacao";
import { podeNoEvento } from "@/lib/autorizacao";
import { buscarEventoPorId } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { sessaoDoEvento, usuarioPseudonimo } from "@/lib/sessao";

/**
 * `/painel/[eventoId]/fila` (H-13) — **casal e moderador**.
 *
 * O moderador está aqui porque esta tela é a razão de ele existir: o casal
 * designa alguém justamente para não precisar olhar o celular durante a própria
 * festa. Ele continua sem poder configurar o dia e sem poder excluir foto —
 * `midia.excluir` não tem linha para ele na matriz, e a ausência é a regra.
 *
 * **ESTA TELA NÃO É URGENTE, E ISSO É CONTEÚDO.** Quem nunca a abrir não perde
 * foto nenhuma: a fila decide o que aparece no álbum e no telão, e tudo já está
 * com o casal desde a intenção (RN-06).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /**
   * O título é literal e não interpola nada (RN-31). Nome de casal e nome de
   * convidado não entram em título de aba, em metadado nem em `page_title` — e
   * o vazamento de 18/08/2026 aconteceu exatamente por aqui.
   */
  title: "Esperando aprovação",
  robots: { index: false, follow: false },
};

export default async function PaginaDaFila({
  params,
}: {
  params: Promise<{ eventoId: string }>;
}) {
  const { eventoId } = await params;
  if (!ehUuid(eventoId)) notFound();

  const evento = await buscarEventoPorId(eventoId);
  if (!evento) notFound();

  const sessao = await sessaoDoEvento(evento.id);
  if (podeNoEvento(sessao, "midia.moderar", evento) === "nao") notFound();

  return (
    <FilaDeAprovacao
      eventoId={evento.id}
      ehDono={podeNoEvento(sessao, "medicao.ver", evento) !== "nao"}
      modoInicial={evento.modoModeracao}
      usuario={usuarioPseudonimo(sessao)}
    />
  );
}
