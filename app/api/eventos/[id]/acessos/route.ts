import { NextResponse } from "next/server";

import { criarAcesso, type TipoDeAcesso } from "@/lib/acessos";
import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";

/**
 * Moderador e telão ganham link (H-02).
 *
 * IDEMPOTENTE POR RÓTULO, e isso é critério de aceite: "dois toques no botão de
 * salvar não geram dois moderadores nem dois links". Num celular, com a rede do
 * salão, o segundo toque é o comportamento normal de quem não viu nada
 * acontecer — e um moderador duplicado significa dois links vivos para a mesma
 * pessoa, um deles impossível de revogar porque ninguém sabe qual é qual.
 *
 * O TOKEN EM CLARO VOLTA UMA VEZ SÓ, no corpo desta resposta. Depois disso só
 * existe o hash no banco. Se o casal perder o link, a saída é revogar e criar
 * outro — que é a mesma saída de qualquer credencial ao portador, e é por isso
 * que a tela tem "copiar" ao lado do campo.
 */

const CAMINHO = "/api/eventos/[id]/acessos";

const TIPOS: TipoDeAcesso[] = ["moderador", "telao"];

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "dia.configurar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const bruto = corpo as Record<string, unknown>;

  /**
   * `casal` NÃO está na lista de tipos criáveis por aqui.
   *
   * O acesso de casal nasce de um convite consumido (`/api/sessao/entrar`), que
   * exige um e-mail que já está no evento. Permitir criá-lo por esta rota daria
   * a quem tem uma sessão de casal a capacidade de fabricar sessões de casal
   * permanentes e não rastreáveis — uma escalada silenciosa a partir de um link
   * que era para durar 30 dias.
   */
  const tipo = TIPOS.find(t => t === bruto.tipo);
  if (!tipo) return pedidoInvalido("tipo invalido");

  const rotulo = typeof bruto.rotulo === "string" ? bruto.rotulo.trim() : "";
  if (tipo === "moderador" && rotulo === "") {
    return pedidoInvalido({ rotulo: "Escreva um nome, para você reconhecer quem é." });
  }

  const criado = await criarAcesso(acesso.evento.id, tipo, rotulo || null);

  return NextResponse.json(
    {
      acesso: {
        id: criado.acesso.id,
        tipo: criado.acesso.tipo,
        rotulo: criado.acesso.rotulo,
      },
      // Nulo quando o rótulo já existia: quem já tem o link continua com ele, e
      // a tela mostra "copiar" em vez de anunciar um link novo que não é novo.
      token: criado.token,
    },
    { status: 201 }
  );
});
