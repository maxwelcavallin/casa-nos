import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, respostaDeErro, rotaDeApi } from "@/lib/api";
import { agoraNoServidor } from "@/lib/datas";
import { ehUuid } from "@/lib/ids";
import { participacaoDaSessao } from "@/lib/sessao";
import { estadoDoEnvio } from "@/lib/janela";
import {
  registrarIntencao,
  type ItemDeIntencao,
  type OrigemDaFoto,
  type Visibilidade,
} from "@/lib/midias";
import { arquivosRecentes, marcarFaixaLenta } from "@/lib/participacoes";
import { assinarFaixas, configuracaoR2, VALIDADE_DA_URL_SEGUNDOS } from "@/lib/r2";

/**
 * A INTENÇÃO ANTES DOS BYTES (H-06). É a rota que decide o projeto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ORDEM DENTRO DESTE ARQUIVO É O REQUISITO, e não uma consequência dele:
 *
 *   1. `registrarIntencao(...)`  → a linha em `midias`, estado `intencao`
 *   2. `assinarFaixas(...)`      → as URLs, que contêm o `midia_id` do passo 1
 *
 * Elas não podem ser trocadas nem paralelizadas: a chave do objeto no R2 é
 * `e/<evento>/m/<midia_id>/...`, e o `midia_id` só existe depois do passo 1.
 * **Se a assinatura falhar, a linha permanece** — é exatamente ela que a
 * reconciliação vai procurar (H-15), e é o que faz "nenhuma mídia perdida" ser
 * uma consulta em vez de uma esperança.
 *
 * `test/intencao-antes-dos-bytes.test.ts` prova as duas metades: que o
 * assinador só é chamado com um `midia_id` que já existe no banco, e que uma
 * assinatura que estoura deixa a linha de intenção viva.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * UMA REQUISIÇÃO ASSINA O LOTE INTEIRO (decisão P3). No uplink do salão cada ida
 * à rede é uma chance de falhar; assinar arquivo por arquivo multiplicaria essa
 * chance pelo número de fotos, no aparelho que já está com dificuldade. Assim, a
 * exigência de medição custa **zero** ida à rede a mais.
 */

const CAMINHO = "/api/eventos/[id]/midias/intencao";

/** Acima disto em 10 minutos, a participação cai de faixa (P11). Nunca é recusa. */
const TETO_DE_ARQUIVOS = 50;
const JANELA_DE_VOLUME_MINUTOS = 10;

type ItemBruto = Record<string, unknown>;

function paraVisibilidade(valor: unknown): Visibilidade | null {
  // DOIS VALORES (RN-03). `ambos` não é estado: o feed já inclui o casal. Um
  // terceiro valor é erro de `CHECK` no banco e erro de `tsc` no cliente — aqui
  // ele é 400, antes de chegar ao banco.
  return valor === "feed" || valor === "noivos" ? valor : null;
}

function paraOrigem(valor: unknown): OrigemDaFoto | null {
  return valor === "camera" || valor === "galeria" ? valor : null;
}

function lerItem(bruto: ItemBruto): ItemDeIntencao | { erro: string } {
  const clientMediaId = bruto.client_media_id;
  const loteId = bruto.lote_id;

  // O `client_media_id` é gerado no aparelho e vai para uma coluna `uuid`. Sem
  // esta validação, um valor torto estoura `22P02` e vira 500 onde a resposta
  // certa é 400 (`dados.md` §3).
  if (!ehUuid(clientMediaId)) return { erro: "client_media_id invalido" };
  if (!ehUuid(loteId)) return { erro: "lote_id invalido" };

  const visibilidade = paraVisibilidade(bruto.visibilidade);
  if (!visibilidade) return { erro: "visibilidade invalida" };

  const tipoArquivo = typeof bruto.tipo_arquivo === "string" ? bruto.tipo_arquivo : "";
  if (!tipoArquivo) return { erro: "tipo_arquivo ausente" };

  return {
    clientMediaId,
    loteId,
    bytes: Number(bruto.bytes ?? 0) || 0,
    tipoArquivo,
    hashConteudo: typeof bruto.hash_conteudo === "string" ? bruto.hash_conteudo : null,
    visibilidade,
    origem: paraOrigem(bruto.origem),
    enfileiradaOffline: bruto.enfileirada_offline === true,
  };
}

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "midia.enviar");
  if (!acesso.ok) return acesso.resposta;
  const participacao = participacaoDaSessao(acesso.sessao);
  if (!participacao) return naoEncontrado();

  const agora = agoraNoServidor();

  /**
   * A janela é conferida AQUI e não só na tela.
   *
   * A tela decide se desenha o botão; esta rota decide se o produto aceita. Uma
   * aba aberta às 23h50 do sétimo dia continua com o botão na tela às 00h10 —
   * e sem esta conferência a foto entraria fora da janela que o casal escolheu.
   *
   * 409, e o cliente trata como ESTADO, não como falha: a fila para de tentar,
   * porque insistir não muda nada.
   */
  if (estadoDoEnvio(acesso.evento, agora, true) !== "aberto") {
    return respostaDeErro(409, "fora da janela");
  }

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();

  const bruto = corpo as { itens?: unknown };
  if (!Array.isArray(bruto.itens) || bruto.itens.length === 0) {
    return pedidoInvalido("itens vazio");
  }

  const itens: ItemDeIntencao[] = [];
  for (const cru of bruto.itens as ItemBruto[]) {
    const lido = lerItem(cru);
    if ("erro" in lido) return pedidoInvalido(lido.erro);

    /**
     * VÍDEO É O ÚNICO CONTEÚDO RECUSADO, e a recusa acontece no aparelho (H-07).
     * Esta é a segunda tranca. 422 com mensagem própria porque o cliente mostra
     * a frase específica de vídeo — nunca "arquivo inválido", que culparia quem
     * escolheu.
     */
    if (lido.tipoArquivo.toLowerCase().startsWith("video/")) {
      return respostaDeErro(422, "tipo nao suportado");
    }
    itens.push(lido);
  }

  /**
   * NENHUM ARQUIVO É RECUSADO POR TAMANHO, POR TIPO DE IMAGEM OU POR VOLUME
   * (RN-11). Acima de 50 arquivos em 10 minutos a participação é
   * **despriorizada**: `faixa_lenta = true` na resposta, e a fila do cliente
   * reduz a concorrência. A resposta nunca é um erro — quem manda 200 fotos é
   * quem mais quer participar, e recusá-lo seria matar a métrica que o produto
   * existe para mover.
   */
  const recentes = await arquivosRecentes(participacao.id, JANELA_DE_VOLUME_MINUTOS);
  const faixaLenta = participacao.faixaLenta || recentes + itens.length > TETO_DE_ARQUIVOS;
  if (faixaLenta && !participacao.faixaLenta) await marcarFaixaLenta(participacao.id);

  // ─── PASSO 1: a intenção. Antes de qualquer URL existir. ───
  const registradas = await registrarIntencao(
    acesso.evento.id,
    participacao.id,
    acesso.evento.modoModeracao,
    itens
  );

  // ─── PASSO 2: as URLs, que só podem ser montadas com o id do passo 1. ───
  const configuracao = configuracaoR2();
  if (!configuracao) {
    /**
     * 503, e a linha de intenção FICA.
     *
     * É o caso que prova o desenho: sem R2 configurado não há como subir byte
     * nenhum, mas o servidor já sabe que a foto existe. A fila tenta de novo, e
     * se ninguém consertar, a reconciliação da H-15 encontra a intenção sem
     * prévia e a perda aparece no número — em vez de a foto nunca ter existido.
     */
    return respostaDeErro(503, "armazenamento indisponivel");
  }

  const expiraEm = new Date(agora.getTime() + VALIDADE_DA_URL_SEGUNDOS * 1000);
  const saida = [];
  for (const { midia, jaExistia } of registradas) {
    /**
     * A VISIBILIDADE ENTRA NA ASSINATURA porque ela decide o PREFIXO (RN-33): a
     * derivada de uma foto `feed` nasce em `pub/`, a de uma foto `noivos` nasce
     * em `prv/`, e o original nasce em `prv/` sempre. É `midia.visibilidade`, do
     * banco, e não a do corpo do pedido — numa repetição de lote (RN-27) a
     * pessoa pode ter trocado a visibilidade no meio, e assinar o prefixo errado
     * subiria a foto privada para o lado público.
     */
    const urls = await assinarFaixas(
      configuracao,
      acesso.evento.id,
      midia.id,
      midia.tipoArquivo,
      midia.visibilidade,
      agora
    );
    saida.push({
      client_media_id: midia.clientMediaId,
      midia_id: midia.id,
      // O cliente usa isto para não subir de novo o que já está armazenado.
      ja_existia: jaExistia,
      previa_confirmada: midia.previaArmazenadaEm !== null,
      original_confirmado: midia.originalArmazenadaEm !== null,
      urls,
      expira_em: expiraEm.toISOString(),
    });
  }

  // 200 e nunca 409 na repetição (RN-27): a fila que dormiu a noite repete o
  // lote para renovar as URLs de 24 h, e isso é o funcionamento normal.
  return NextResponse.json({ itens: saida, faixa_lenta: faixaLenta });
});
