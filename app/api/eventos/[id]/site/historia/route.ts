import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { conferirHistoria, salvarHistoria } from "@/lib/conteudo-do-site";
import { ehUuid } from "@/lib/ids";

/**
 * A NOSSA HISTÓRIA (v1.0, V-07).
 *
 * **UMA LINHA POR EVENTO**, com `on conflict` — por isso `PATCH` e não `POST`: o
 * casal não cria histórias, ele escreve a dele.
 *
 * **TEXTO VAZIO APAGA**, e não é erro. O casal que escreveu e se arrependeu
 * precisa poder voltar ao estado anterior — e o estado anterior é "a seção não
 * renderiza" (RV-02), não "a seção mostra uma caixa vazia". A exclusão é lógica.
 *
 * **NENHUM HTML É INTERPRETADO** (RV-07): o texto é gravado como veio e a
 * renderização escapa. Colar `<b>oi</b>` do WhatsApp mostra o `<b>oi</b>`
 * escrito na tela do convidado, e não negrito.
 */

const CAMINHO = "/api/eventos/[id]/site/historia";

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  // Antes de qualquer consulta (`dados.md` §3).
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  const { dados, erros } = conferirHistoria(corpo);
  // O teto responde com quantos caracteres foram enviados e qual é o teto —
  // nunca "longo demais", que não diz quantos cortar.
  if (!dados) return pedidoInvalido({ campos: erros });

  const historia = await salvarHistoria(acesso.evento.id, dados);

  return NextResponse.json({
    titulo: historia?.titulo ?? null,
    texto: historia?.texto ?? "",
  });
});
