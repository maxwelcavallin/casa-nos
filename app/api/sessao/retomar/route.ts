import { NextResponse } from "next/server";

import { corpoJson, pedidoInvalido, respostaDeErro, rotaDeApi } from "@/lib/api";
import { buscarEventoPorId } from "@/lib/eventos";
import { chaveDeOrigem, excedeuLimite, permitir } from "@/lib/limite-taxa";
import { participacaoPorLinkGuardado, tokenDeRetomada } from "@/lib/participacoes";
import { ehTokenDeAcesso } from "@/lib/segredos";
import { gravarCookieDeParticipacao } from "@/lib/sessao";

/**
 * O LINK GUARDADO VIRA SESSÃO (H-22).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **ESTA ROTA NÃO ESTÁ NA §6.1 DO PRD, e a adição está declarada.** O PRD lista
 * a tela `GET /r/[token]` e a rota que **gera** o link; ele não lista quem troca
 * o token por cookie — e alguém precisa, pelos dois mesmos motivos de
 * `/api/sessao/entrar`, que já enfrentou isto na H-02:
 *
 * 1. **Componente de servidor não grava cookie no Next.** Só rota e ação de
 *    servidor podem.
 * 2. **Um `GET` que consome o link seria disparado pelo verificador do cliente
 *    de mensagem.** O convidado que manda o link para si mesmo no WhatsApp
 *    receberia "este link não vale mais" no primeiro toque, porque a
 *    pré-visualização do WhatsApp já o teria aberto. É o defeito clássico de
 *    link mágico, e ele é invisível em teste.
 *
 * Ficou rota própria em vez de entrar em `/api/sessao/entrar` porque as duas
 * respondem coisas diferentes: aquela consome um convite de uso único do casal e
 * responde 410 quando ele já foi usado; esta é reutilizável enquanto o link for
 * o mais recente, e o que ela devolve é uma **participação**.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **O TOKEN NOVO NÃO INVALIDA O ANTIGO CELULAR** — ele é o do aparelho novo. Ver
 * `tokenDeRetomada`: o produto não conhece o token antigo em claro (só o hash),
 * e a pessoa que achar o celular velho continua com o álbum dela. O que invalida
 * o link guardado anterior é **gerar outro link**, e a tela diz isso.
 */

const CAMINHO = "/api/sessao/retomar";

/** Dez por hora por origem. Um link guardado é aberto uma vez, talvez duas. */
const LIMITE = 10;
const JANELA_MS = 60 * 60 * 1000;

export const POST = rotaDeApi(CAMINHO, async pedido => {
  if (!permitir(chaveDeOrigem(pedido.headers, "sessao-retomar"), LIMITE, JANELA_MS)) {
    return excedeuLimite();
  }

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const bruto = corpo as Record<string, unknown>;

  // Formato antes da consulta: o token vem de um link que passou por um cliente
  // de mensagem, e cliente de mensagem quebra URL longa em duas linhas.
  if (!ehTokenDeAcesso(bruto.token)) return respostaDeErro(410, "link nao vale mais");

  const participacao = await participacaoPorLinkGuardado(bruto.token);
  /**
   * 410, e os três casos — não existe, foi cancelado por um link novo,
   * participação excluída — dão a MESMA resposta. Distinguir só informaria quem
   * está adivinhando token, e a tela mostra a mesma saída útil nos três: "Este
   * link não vale mais. Se você gerou um novo, use o mais recente."
   */
  if (!participacao) return respostaDeErro(410, "link nao vale mais");

  /**
   * O SLUG VOLTA NA RESPOSTA porque o destino é `/e/<slug>/album/minhas`, e o
   * `/r/[token]` **não tem evento na URL** — como o telão. Montar o destino no
   * cliente exigiria uma segunda requisição, e ela aconteceria no aparelho de
   * alguém que acabou de trocar de celular, provavelmente na rede do salão.
   */
  const evento = await buscarEventoPorId(participacao.eventoId);
  if (!evento) return respostaDeErro(410, "link nao vale mais");

  const token = await tokenDeRetomada(participacao.id);

  const resposta = NextResponse.json({
    evento_id: participacao.eventoId,
    slug: evento.slug,
    nome_casal: evento.nomeCasal,
    /**
     * `retomado` — o terceiro valor de `identification_mode`, e ele existe para
     * que P saiba distinguir "esta é uma pessoa nova" de "esta é a mesma pessoa
     * noutro aparelho". Sem ele, uma troca de celular apareceria como um
     * convidado a mais no numerador da North Star.
     */
    modo_identificacao: "retomado",
  });
  gravarCookieDeParticipacao(resposta, participacao.eventoId, token);
  return resposta;
});
