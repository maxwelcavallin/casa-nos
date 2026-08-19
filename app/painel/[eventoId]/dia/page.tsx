import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { listarAcessos } from "@/lib/acessos";
import { pode } from "@/lib/autorizacao";
import { TelaDoDia } from "@/components/painel/TelaDoDia";
import { agoraNoServidor, dataPorExtenso, janelaDeEnvioPadrao, paraInputLocal } from "@/lib/datas";
import { buscarEventoPorId } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { sessaoDoEvento } from "@/lib/sessao";

/**
 * `/painel/[eventoId]/dia` (H-02).
 *
 * 404 E NÃO 403 quando a sessão não pode configurar este evento. O casal do
 * casamento A que recebe o link do painel do casamento B não pode nem descobrir
 * que aquele id existe — é a regra RN-25, e é o teste de vazamento entre
 * inquilinos que a guarda.
 *
 * O PADRÃO DA JANELA É CALCULADO NA LEITURA, e não gravado aqui. Um evento
 * recém-criado mostra a janela sugerida (D−1 00:00 a D+7 23:59:59, no fuso do
 * evento) nos campos, e ela só vira linha no banco quando o casal salva. Gravar
 * na abertura transformaria uma visita em escrita — e o padrão passaria a
 * parecer decisão de alguém.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Título literal (RN-31): sem nome de casal, sem data. O nome deles aparece na
  // tela, onde ele identifica; no título ele viaja para o histórico do
  // navegador, para a aba e para tudo que lê metadado.
  title: "O dia do casamento",
  robots: { index: false, follow: false },
};

export default async function PaginaDoDia({
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
  if (pode(sessao, "evento.configurar") === "nao") notFound();

  const moderadores = await listarAcessos(evento.id, "moderador");
  const telao = await listarAcessos(evento.id, "telao");

  const padrao = janelaDeEnvioPadrao(evento.dataEvento, evento.fuso);
  const agora = agoraNoServidor();

  return (
    <TelaDoDia
      dados={{
        eventoId: evento.id,
        nomeCasal: evento.nomeCasal,
        dataPorExtenso: dataPorExtenso(evento.dataEvento),
        // Os campos `datetime-local` falam horário LOCAL DO EVENTO. Mandar o
        // instante em UTC faria o casal ver a janela dele começando às 03:00 do
        // dia 21 — e "corrigir" isso mudaria a janela real em três horas.
        envioAbreEm: paraInputLocal(evento.envioAbreEm ?? padrao.abre, evento.fuso),
        envioFechaEm: paraInputLocal(evento.envioFechaEm ?? padrao.fecha, evento.fuso),
        inicioFestaEm: paraInputLocal(evento.inicioFestaEm, evento.fuso),
        fimFestaEm: paraInputLocal(evento.fimFestaEm, evento.fuso),
        modoModeracao: evento.modoModeracao,
        presentesContagem:
          evento.presentesContagem === null ? "" : String(evento.presentesContagem),
        moderadores: moderadores.map(m => ({ id: m.id, rotulo: m.rotulo })),
        temTelao: telao.length > 0,
        pareceNovo: evento.envioAbreEm === null && evento.inicioFestaEm === null,
        ehDono: sessao.tipo === "casal" && sessao.acesso.dono,
        festaTerminou: evento.fimFestaEm !== null && evento.fimFestaEm < agora,
      }}
    />
  );
}
