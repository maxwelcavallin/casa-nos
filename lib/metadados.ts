import type { Metadata } from "next";

import { dataPorExtenso } from "@/lib/datas";
import type { EventoPublico } from "@/lib/eventos";

/**
 * O cartão que aparece quando alguém cola o link no WhatsApp.
 *
 * Isto não é detalhe de SEO: o convite deste produto CIRCULA por link colado em
 * grupo. O que a prévia mostra é, para boa parte dos convidados, a primeira
 * impressão do casamento — antes de qualquer pixel da página carregar.
 *
 * Nada aqui vaza o que o casal escondeu: o recorte público já removeu o nome do
 * local e o endereço antes de chegar nesta função.
 */
export function metadadosDoEvento(evento: EventoPublico): Metadata {
  const titulo = `${evento.nomeCasal} · ${dataPorExtenso(evento.dataEvento)}`;
  const descricao = evento.localNome
    ? `${evento.localNome} · ${evento.cidade}, ${evento.uf}. Save the date.`
    : `Vai ser em ${evento.cidade}, ${evento.uf}. Save the date.`;

  return {
    title: titulo,
    description: descricao,
    openGraph: {
      title: titulo,
      description: descricao,
      locale: "pt_BR",
      type: "website",
    },
    twitter: { card: "summary", title: titulo, description: descricao },
  };
}
