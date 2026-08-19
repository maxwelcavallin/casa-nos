import { NextResponse } from "next/server";

import { consumirConvite } from "@/lib/acessos";
import { corpoJson, pedidoInvalido, respostaDeErro, rotaDeApi } from "@/lib/api";
import { chaveDeOrigem, excedeuLimite, permitir } from "@/lib/limite-taxa";
import { ehTokenDeAcesso } from "@/lib/segredos";
import { gravarCookieDeAcesso } from "@/lib/sessao";

/**
 * O convite vira sessão (H-02).
 *
 * POR QUE `POST` E NÃO A PRÓPRIA PÁGINA `/entrar/[token]`:
 *
 * 1. **Cookie.** Componente de servidor não pode gravar cookie no Next; só rota
 *    e ação de servidor podem. A página existe, mostra os quatro estados e
 *    chama esta rota — que é o único lugar onde a sessão é criada.
 * 2. **Pré-busca.** Um `GET` que consome o convite seria disparado pelo
 *    verificador de link do cliente de e-mail, e o casal receberia "este link
 *    expirou" no primeiro clique, porque o Outlook já o teria usado. É um
 *    defeito clássico de link mágico, e ele é invisível em teste — nenhum
 *    ambiente de desenvolvimento tem um antivírus de e-mail abrindo os links.
 *
 * O CONSUMO É ATÔMICO no banco (`update ... where usado_em is null returning`):
 * dois cliques simultâneos, que acontecem, e só um cria sessão.
 */

const CAMINHO = "/api/sessao/entrar";

/** Dez trocas por hora por origem: o link é único e já morre no primeiro uso. */
const LIMITE = 10;
const JANELA_MS = 60 * 60 * 1000;

export const POST = rotaDeApi(CAMINHO, async pedido => {
  if (!permitir(chaveDeOrigem(pedido.headers, "sessao-entrar"), LIMITE, JANELA_MS)) {
    return excedeuLimite();
  }

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const bruto = corpo as Record<string, unknown>;

  // Formato conferido ANTES da consulta, pelo mesmo motivo de `ehUuid`: o token
  // vem da URL e pode ser qualquer coisa. Malformado custa zero ida ao banco.
  if (!ehTokenDeAcesso(bruto.token)) {
    return respostaDeErro(410, "link expirado");
  }

  const consumido = await consumirConvite(bruto.token);

  /**
   * 410 e não 404, e os três casos — não existe, expirou, já foi usado — dão a
   * MESMA resposta. Distinguir "não existe" de "já usado" só informa quem está
   * adivinhando token. A tela mostra "Este link expirou" com o botão que manda
   * outro, que é a saída correta nos três.
   */
  if (!consumido) return respostaDeErro(410, "link expirado");

  const resposta = NextResponse.json({ evento_id: consumido.eventoId });
  gravarCookieDeAcesso(resposta, consumido.eventoId, consumido.token);
  return resposta;
});
