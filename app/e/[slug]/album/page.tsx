import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AlbumDoConvidado } from "@/components/album/AlbumDoConvidado";
import { agoraNoServidor } from "@/lib/datas";
import { eventoPorSlug } from "@/lib/resolver-evento";
import { ehSlug } from "@/lib/ids";
import { estadoDoEnvio } from "@/lib/janela";
import { garantirParticipacao, participacaoPorToken } from "@/lib/participacoes";
import { tokenDeParticipacao, usuarioPseudonimo } from "@/lib/sessao";

/**
 * O ÁLBUM DO CONVIDADO (H-05) — a casca onde tudo o mais mora.
 *
 * `force-dynamic` e não é escolha de gosto: a página cria a participação deste
 * aparelho e depende do estado da janela de envio AGORA. Uma versão estatizada
 * serviria a participação de outra pessoa e a janela do momento do build.
 *
 * A PARTICIPAÇÃO NASCE NA PRIMEIRA RESPOSTA. O `middleware.ts` cunha o token e o
 * entrega nos cabeçalhos desta requisição; aqui a linha é gravada com
 * `on conflict`, que também carimba `ultimo_acesso_em`. Quando o convidado toca
 * no botão, um segundo depois, o servidor já sabe quem ele é — sem tela
 * intermediária, sem cadastro, sem pedir nada. É a regra N11 da estratégia:
 * nenhum passo novo entra no fluxo dele.
 */

export const dynamic = "force-dynamic";

/**
 * `noindex` (H-05), e o título NÃO carrega nome de convidado (RN-31).
 *
 * O nome do casal aparece aqui porque o site é deles e o convidado precisa
 * reconhecer que chegou no lugar certo — o que sai para o GA4 é outra coisa, e é
 * mascarado em `lib/analytics-privacidade.ts`. Nenhum rótulo de convidado entra
 * em título, descrição ou `og:` em nenhuma página deste produto: ele é PII de
 * terceiro, e o convidado nem escolheu estar ali.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!ehSlug(slug)) return { title: "casa-nos", robots: { index: false, follow: false } };
  const evento = await eventoPorSlug(slug);
  return {
    title: evento ? `Fotos de ${evento.nomeCasal}` : "casa-nos",
    robots: { index: false, follow: false },
  };
}

export default async function PaginaDoAlbum({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Validação antes da consulta (`dados.md` §3): slug torto é 404 barato, e não
  // uma ida ao banco com o que quer que tenha vindo na URL.
  if (!ehSlug(slug)) notFound();

  const evento = await eventoPorSlug(slug);
  // `eventoPorSlug` já filtra `publicado = true`: abrir o álbum de um evento não
  // publicado devolve 404 (H-05), com a mesma tela de quem errou o endereço.
  if (!evento) notFound();

  const token = await tokenDeParticipacao(evento.id);

  /**
   * A PARTICIPAÇÃO NASCE AQUI — mas não quando a porta está fechada.
   *
   * `novos_aparelhos_bloqueados` fecha o evento a APARELHOS NOVOS sem derrubar
   * quem já está enviando (B14). Se a página criasse a participação de qualquer
   * jeito e só escondesse o botão, o bloqueio seria decoração: o aparelho novo
   * sairia daqui com sessão válida e a rota de intenção o aceitaria, porque para
   * ela ele seria um convidado como outro qualquer.
   *
   * Com a porta fechada, portanto, a página só PROCURA a participação; sem a
   * porta fechada, ela cria (ou reencontra) com `on conflict`. Uma consulta nos
   * dois casos.
   *
   * Sem token não há participação — e isso acontece: o proxy não roda em
   * pré-visualização de link, e um navegador com cookie bloqueado nunca devolve
   * o que foi gravado. A tela continua abrindo, com o álbum visível e sem botão.
   * Nunca uma tela de erro: o convidado não fez nada de errado.
   */
  const participacao = !token
    ? null
    : evento.novosAparelhosBloqueados
      ? await participacaoPorToken(evento.id, token)
      : await garantirParticipacao(evento.id, token);

  const estado = estadoDoEnvio(evento, agoraNoServidor(), participacao !== null);

  return (
    <AlbumDoConvidado
      eventoId={evento.id}
      nomeCasal={evento.nomeCasal}
      participacaoId={participacao?.id ?? null}
      faixaLenta={participacao?.faixaLenta ?? false}
      estadoDoEnvio={estado}
      usuario={usuarioPseudonimo(
        participacao ? { tipo: "convidado", participacao } : { tipo: "anonimo" }
      )}
    />
  );
}
