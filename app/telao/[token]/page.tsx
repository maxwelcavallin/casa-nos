import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { TelaoDoSalao } from "@/components/telao/TelaoDoSalao";
import { enderecoParaLer, enderecoParaQr, origemDaRequisicao } from "@/lib/enderecos";
import { buscarEventoPorId } from "@/lib/eventos";
import { qrParaSvg } from "@/lib/qr";
import { ehTokenDeAcesso } from "@/lib/segredos";
import { sessaoDoTelao } from "@/lib/sessao";
import { cor } from "@/lib/tokens";
import { VERSAO_DO_APP } from "@/lib/versao";

/**
 * `/telao/[token]` (H-12) — a parede do salão.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ABRE POR LINK PRÓPRIO, **SEM COOKIE**, sem interação e sem barra de navegação.
 * O computador ligado ao projetor não é autenticado por ninguém e não guarda
 * estado: o token **é** o endereço, e ele é resolvido por `lib/sessao.ts`, que
 * continua sendo o único lugar do produto que resolve portador.
 *
 * **ELA NÃO CRIA PARTICIPAÇÃO.** O telão é leitura pura: não envia, não modera,
 * não conta como convidado. Se ele criasse participação, o computador do salão
 * entraria no denominador da North Star como uma pessoa que nunca mandou foto —
 * e a métrica que decide o produto sairia um ponto abaixo por causa de um cabo
 * HDMI.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TOKEN INVÁLIDO, REVOGADO OU DE OUTRO TIPO É **404**, e não uma tela de erro:
 * a tela de erro deste produto é uma página do Next, e uma página do Next
 * projetada num casamento é exatamente o que a H-12 proíbe. 404 numa TV mostra
 * a mesma coisa que uma URL errada mostra em qualquer lugar — e quem vê isso é
 * quem está colando o link, antes da festa, não o salão.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Sem nome de casal e sem data (RN-31): este título fica na aba de um
  // computador emprestado do salão, e o que sai para o GA4 é mascarado.
  title: "casa-nos",
  robots: { index: false, follow: false },
};

export default async function PaginaDoTelao({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  /**
   * Formato conferido ANTES de qualquer consulta (`dados.md` §3, PRD §6.1).
   *
   * O token do telão chega de um link colado num e-mail ou num WhatsApp, e
   * cliente de e-mail quebra URL longa em duas linhas. Token torto é 404
   * barato, não uma ida ao banco com o que quer que tenha vindo na URL.
   */
  if (!ehTokenDeAcesso(token)) notFound();

  const resolvido = await sessaoDoTelao(token);
  if (!resolvido) notFound();

  const evento = await buscarEventoPorId(resolvido.eventoId);
  if (!evento) notFound();

  const cabecalhos = await headers();
  const origem = origemDaRequisicao(cabecalhos);

  /**
   * O CÓDIGO É GERADO AQUI, E **NÃO** BUSCADO EM `/api/eventos/[id]/qr`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * O motivo é a matriz de permissão, e ele é bom: `evento.materiais.ver` é do
   * **casal e do moderador**; o telão não a tem (PRD §7). Ele é leitura pura, e
   * "leitura pura" inclui não pedir o material impresso do casamento.
   *
   * A saída fácil seria dar a permissão ao telão — e ela abriria uma linha na
   * matriz para resolver um problema de desenho. A saída certa é esta: a página
   * é componente de servidor, `qrParaSvg` é uma função pura, e o código nasce
   * embutido no HTML. **A mesma função, o mesmo desenho, uma requisição a
   * menos** — e uma requisição a menos num computador de salão às 23h é o tipo
   * de coisa que só se percebe quando falta.
   *
   * `data:` e não SVG cru na marcação: o `<img>` do `ChamadaQr` serve as duas
   * superfícies sem nenhum `dangerouslySetInnerHTML` no produto.
   * ─────────────────────────────────────────────────────────────────────────
   */
  const svg = qrParaSvg(
    // `?o=telao` é a origem por superfície: sem ela, "quantos convidados vieram
    // da parede" não tem resposta, e a comparação com o cartão de mesa vira
    // palpite.
    enderecoParaQr(origem, evento.slug, "telao"),
    { modulo: cor.primary, campo: cor.bg },
    { rotulo: "Codigo do album do casamento" }
  );

  return (
    <TelaoDoSalao
      eventoId={evento.id}
      nomeCasal={evento.nomeCasal}
      // O endereço escrito, sem esquema e sem `?o=`: é o que a pessoa a 9 metros
      // vai digitar se o código não ler.
      endereco={enderecoParaLer(origem, evento.slug)}
      urlDoQr={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      versaoInicial={VERSAO_DO_APP}
      token={token}
    />
  );
}
