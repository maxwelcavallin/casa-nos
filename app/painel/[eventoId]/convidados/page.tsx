import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListaDeConvidados } from "@/components/painel/ListaDeConvidados";
import { pode } from "@/lib/autorizacao";
import { listarConvidados } from "@/lib/convidados";
import { agoraNoServidor } from "@/lib/datas";
import { buscarEventoPorId } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { sessaoDoEvento } from "@/lib/sessao";

/**
 * `/painel/[eventoId]/convidados` (H-03).
 *
 * 404 E NÃO 403 quando a sessão não pode editar a lista deste evento. O casal do
 * casamento A que recebe o link do painel do casamento B não pode nem descobrir
 * que aquele id existe (RN-25) — e a lista de convidados do outro casamento é
 * justamente o dado que menos pode vazar aqui.
 *
 * A LISTA VEM PELO SERVIDOR, inteira: são até 300 linhas de nome, e uma segunda
 * ida à rede para buscá-las faria a tela abrir vazia e preencher depois — com um
 * estado vazio piscando na frente de quem já tem lista.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Título literal (RN-31). Aqui ele não pode conter nome de convidado por um
  // motivo a mais que o de sempre: esta é a tela em que os nomes de terceiros
  // moram, e o título viaja para a aba e para o histórico do navegador.
  title: "Sua lista de convidados",
  robots: { index: false, follow: false },
};

export default async function PaginaDeConvidados({
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
  if (pode(sessao, "convidados.editar") === "nao") notFound();

  const convidados = await listarConvidados(evento.id);
  const agora = agoraNoServidor();

  return (
    <ListaDeConvidados
      dados={{
        eventoId: evento.id,
        convidados: convidados.map(c => ({
          id: c.id,
          nome: c.nome,
          pessoasNoSlot: c.pessoasNoSlot,
          ausente: c.ausente,
        })),
        /**
         * "Não foi" e a contagem de presentes só existem **depois** da festa
         * (H-03). Antes dela, marcar ausência não faz sentido — e um controle
         * que não faz sentido ainda é um controle que alguém vai tocar por
         * engano na véspera.
         */
        festaTerminou: evento.fimFestaEm !== null && evento.fimFestaEm < agora,
        ehDono: sessao.tipo === "casal" && sessao.acesso.dono,
      }}
    />
  );
}
