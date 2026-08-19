import { NextResponse } from "next/server";

import { listarAcessos } from "@/lib/acessos";
import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { instanteDoInputLocal } from "@/lib/datas";
import { sql } from "@/lib/db";
import { ehUuid } from "@/lib/ids";

/**
 * O CASAL CONFIGURA O DIA (H-02).
 *
 * TRÊS JANELAS, E ELAS NÃO SÃO A MESMA COISA (PRD §3.1, V9). Esta rota escreve
 * duas: a de **envio** (o que o produto aceita) e a da **festa** (o que conta
 * como "durante a festa", e que decide o silêncio de notificações). A terceira,
 * a de medição, é derivada de `data_evento` e vive na view — ninguém a
 * configura, e é por isso que ela não está aqui.
 *
 * O QUE CHEGA É HORÁRIO LOCAL DO EVENTO (`2027-08-21T00:00`), e o que é gravado
 * é INSTANTE. A conversão acontece em `lib/datas.ts`, com o fuso do evento, e
 * `test/janela-de-envio.brasilia.test.ts` prova que o resultado é o mesmo com o
 * processo em UTC e em Brasília. Gravar o texto do campo faria a janela
 * significar horas diferentes no servidor e no celular do convidado.
 *
 * ALTERAR A JANELA NUNCA APAGA MÍDIA RECEBIDA. Não há `delete` nesta rota, e não
 * há nada que dependa de a mídia estar dentro da janela para continuar existindo:
 * a janela decide o que o produto ACEITA daqui para a frente, e nada mais.
 */

const CAMINHO = "/api/eventos/[id]/dia";

type Erros = Record<string, string>;

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "dia.configurar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const bruto = corpo as Record<string, unknown>;

  const fuso = acesso.evento.fuso;
  const erros: Erros = {};

  const texto = (chave: string): string | null =>
    typeof bruto[chave] === "string" ? (bruto[chave] as string) : null;

  const envioAbre = instanteDoInputLocal(texto("envio_abre_em"), fuso);
  const envioFecha = instanteDoInputLocal(texto("envio_fecha_em"), fuso);
  const inicioFesta = instanteDoInputLocal(texto("inicio_festa_em"), fuso);
  const fimFesta = instanteDoInputLocal(texto("fim_festa_em"), fuso);

  // "Falta uma parte da data." — a validação acontece no ENVIO, nunca a cada
  // tecla (`design-system.md` §11 da casa): validar enquanto a pessoa ainda
  // digita a data é hostil.
  if (texto("envio_abre_em") && !envioAbre) erros.envio_abre_em = "Falta uma parte da data.";
  if (texto("envio_fecha_em") && !envioFecha) erros.envio_fecha_em = "Falta uma parte da data.";
  if (texto("inicio_festa_em") && !inicioFesta) erros.inicio_festa_em = "Falta uma parte da data.";
  if (texto("fim_festa_em") && !fimFesta) erros.fim_festa_em = "Falta uma parte da data.";

  if (envioAbre && envioFecha && envioFecha <= envioAbre) {
    erros.envio_fecha_em = "O fim precisa ser depois do começo.";
  }
  if (inicioFesta && fimFesta && fimFesta <= inicioFesta) {
    erros.fim_festa_em = "O fim da festa precisa ser depois do começo.";
  }
  // "Falta o outro horário." — um dos dois sozinho torna "durante a festa"
  // indefinível, e dois dos três bloqueios da medição dependem dessa janela.
  if ((inicioFesta && !fimFesta) || (!inicioFesta && fimFesta)) {
    erros[inicioFesta ? "fim_festa_em" : "inicio_festa_em"] = "Falta o outro horário.";
  }
  if (envioFecha && fimFesta && envioFecha < fimFesta) {
    erros.envio_fecha_em = "Os envios fechariam antes da festa acabar.";
  }

  const modo = bruto.modo_moderacao;
  if (modo !== undefined && modo !== "direto" && modo !== "fila") {
    erros.modo_moderacao = "Escolha como as fotos aparecem.";
  }

  /**
   * FILA EXIGE MODERADOR, e a conferência é do servidor.
   *
   * A tela desabilita o botão com a razão escrita ao lado (H-02), mas a tela é
   * uma cortesia: quem manda um `PATCH` direto passaria por cima. E o custo do
   * furo é a festa inteira sem nada aparecendo no telão, com o casal achando que
   * configurou certo — a falha mais cara desta tela, e ela é silenciosa.
   */
  if (modo === "fila") {
    const moderadores = await listarAcessos(acesso.evento.id, "moderador");
    if (moderadores.length === 0) {
      erros.modo_moderacao = "Escolha quem aprova para poder salvar.";
    }
  }

  const presentes = bruto.presentes_contagem;
  let presentesContagem: number | null | undefined;
  if (presentes === null || presentes === "") {
    presentesContagem = null;
  } else if (presentes !== undefined) {
    const numero = Number(presentes);
    if (!Number.isFinite(numero) || !Number.isInteger(numero)) {
      erros.presentes_contagem = "Escreva só o número de pessoas.";
    } else if (numero <= 0) {
      erros.presentes_contagem = "O número precisa ser maior que zero.";
    } else {
      presentesContagem = numero;
    }
  }

  // O erro aparece NO CAMPO, e por isso ele viaja identificado por campo. Um
  // alerta no topo resumindo o que aconteceu embaixo é reprovação da §17.3.
  if (Object.keys(erros).length > 0) return pedidoInvalido(erros);

  /**
   * `coalesce(${valor}, coluna)` em vez de montar SQL condicional: o que não foi
   * mandado fica como está. Escrever `null` no que o formulário não enviou
   * apagaria a janela da festa toda vez que o casal salvasse só a contagem de
   * presentes — e o casal nunca saberia por quê.
   */
  const linhas = await sql`
    update eventos set
      modo_moderacao             = coalesce(${modo === "direto" || modo === "fila" ? modo : null}, modo_moderacao),
      envio_abre_em              = coalesce(${envioAbre}, envio_abre_em),
      envio_fecha_em             = coalesce(${envioFecha}, envio_fecha_em),
      inicio_festa_em            = coalesce(${inicioFesta}, inicio_festa_em),
      fim_festa_em               = coalesce(${fimFesta}, fim_festa_em),
      novos_aparelhos_bloqueados = coalesce(${
        typeof bruto.novos_aparelhos_bloqueados === "boolean"
          ? bruto.novos_aparelhos_bloqueados
          : null
      }, novos_aparelhos_bloqueados),
      -- CASE e nao COALESCE porque aqui o NULO E UM VALOR: nulo significa
      -- "ainda nao informado", e o casal precisa poder voltar a esse estado. Com
      -- COALESCE seria impossivel apagar a contagem, e um numero errado ficaria
      -- para sempre, no campo que a medicao de participacao por pessoa usa.
      presentes_contagem         = case when ${presentesContagem !== undefined}
                                        then ${presentesContagem ?? null}::integer
                                        else presentes_contagem end,
      atualizado_em              = now()
     where id = ${acesso.evento.id}
       and excluido_em is null
    returning id
  `;

  if (!linhas.length) return naoEncontrado();
  return NextResponse.json({ salvo: true });
});
