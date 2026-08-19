import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MinhasFotos } from "@/components/album/MinhasFotos";
import { listarConvidadosPublicos } from "@/lib/convidados";
import { agoraNoServidor } from "@/lib/datas";
import { diasDesdeOEvento } from "@/lib/medida-do-dia";
import { ehSlug } from "@/lib/ids";
import { estadoDoEnvio, quandoAbre } from "@/lib/janela";
import { participacaoPorToken } from "@/lib/participacoes";
import { eventoPorSlug } from "@/lib/resolver-evento";
import { tokenDeParticipacao, usuarioPseudonimo } from "@/lib/sessao";

/**
 * `/e/[slug]/album/minhas` (H-08, H-09, H-10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELA **NÃO** CRIA PARTICIPAÇÃO, e a diferença em relação a `/album` é
 * deliberada.
 *
 * O álbum cria a participação na primeira resposta (o `proxy.ts` cunha o token,
 * a página grava a linha) porque é dali que o convidado entra pelo QR. Esta tela
 * é sempre **posterior** a isso: chega-se nela depois de mandar. Sem participação
 * aqui não há o que mostrar — e criar uma criaria um álbum pessoal vazio para
 * alguém que colou o endereço, o que é um convite a um beco sem saída.
 *
 * Sem participação, a tela abre com o vazio e sem botão. Nunca uma tela de erro:
 * a pessoa não fez nada de errado.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A LISTA DE CONVIDADOS É SERVIDA AQUI, PELO SERVIDOR, e não buscada pelo
 * cliente: a folha de identificação abre **junto com a tela**, e uma lista que
 * chegasse depois faria a folha aparecer só com o campo de digitar e depois mudar
 * de forma na frente da pessoa. O custo é alguns quilobytes no HTML; o ganho é
 * que a identificação funciona no primeiro quadro, inclusive sem rede.
 */

export const dynamic = "force-dynamic";

/**
 * O TÍTULO É LITERAL E NÃO CARREGA NOME DE NINGUÉM (§17.6, RN-31).
 *
 * Nem do convidado — que é PII de **terceiro**, e ele nem escolheu estar ali —,
 * nem do casal: o título viaja para a aba, para o histórico e para tudo que lê
 * metadado, e esta é a página de alguém que não é dono de nada aqui.
 */
export const metadata: Metadata = {
  title: "As minhas fotos",
  robots: { index: false, follow: false },
};

export default async function PaginaDeMinhasFotos({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Validação antes da consulta (`dados.md` §3).
  if (!ehSlug(slug)) notFound();

  const evento = await eventoPorSlug(slug);
  if (!evento) notFound();

  const token = await tokenDeParticipacao(evento.id);
  const participacao = token ? await participacaoPorToken(evento.id, token) : null;

  // A lista só é buscada quando há participação: o endpoint público exige uma, e
  // servir os nomes a quem não tem seria dar a lista de convidados de um
  // casamento a quem colou o endereço.
  const convidados = participacao ? await listarConvidadosPublicos(evento.id) : [];

  const agora = agoraNoServidor();
  const estado = estadoDoEnvio(evento, agora, participacao !== null);

  return (
    <MinhasFotos
      eventoId={evento.id}
      slug={evento.slug}
      /**
       * O nome do casal serve à mensagem pronta do `wa.me` no link guardado
       * (H-22) — `Minhas fotos do casamento de [casal]: [link]` — e **não**
       * aparece em linha com teto nesta tela: o título continua sendo "As
       * minhas fotos", literal (RN-31), e a barra de contexto do `/r/[token]`
       * usa "deste casamento", que mede 34 sempre.
       */
      nomeCasal={evento.nomeCasal}
      participacaoId={participacao?.id ?? null}
      faixaLenta={participacao?.faixaLenta ?? false}
      estadoDoEnvio={estado}
      abertura={quandoAbre(evento)}
      diasDesdeOEvento={diasDesdeOEvento(evento, agora)}
      convidados={convidados}
      rotuloAtual={participacao?.rotulo ?? null}
      // A folha abre sozinha só para quem ainda não disse quem é. Quem já
      // respondeu não é perguntado de novo a cada envio — a pergunta é uma vez
      // por participação, e trocar o nome depois é uma ação dele.
      precisaSeIdentificar={
        participacao !== null && participacao.modoIdentificacao === null
      }
      usuario={usuarioPseudonimo(
        participacao ? { tipo: "convidado", participacao } : { tipo: "anonimo" }
      )}
    />
  );
}
