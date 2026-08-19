import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { listarAcessos } from "@/lib/acessos";
import { MateriaisDoQr } from "@/components/painel/MateriaisDoQr";
import { podeNoEvento } from "@/lib/autorizacao";
import { enderecoParaLer, origemDaRequisicao } from "@/lib/enderecos";
import { buscarEventoPorId } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { quandoAbre } from "@/lib/janela";
import { sessaoDoEvento } from "@/lib/sessao";

/**
 * `/painel/[eventoId]/materiais` (H-04).
 *
 * **CASAL E MODERADOR** (`evento.materiais.ver`), e o moderador está aqui de
 * propósito: quem vai aprovar durante a festa é quem pode precisar reimprimir um
 * cartão que sumiu da mesa 8 às 22h. Ele continua sem poder configurar o dia e
 * sem poder excluir foto.
 *
 * ESTA TELA NÃO TEM ESTADO VAZIO, e a ausência é declarada: sempre há três
 * materiais, gerados a partir do evento, que sempre existe quando esta rota
 * abre. Não há lista para ficar vazia.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "O código para imprimir",
  robots: { index: false, follow: false },
};

export default async function PaginaDeMateriais({
  params,
}: {
  params: Promise<{ eventoId: string }>;
}) {
  const { eventoId } = await params;
  if (!ehUuid(eventoId)) notFound();

  const evento = await buscarEventoPorId(eventoId);
  if (!evento) notFound();

  const sessao = await sessaoDoEvento(evento.id);
  if (podeNoEvento(sessao, "evento.materiais.ver", evento) === "nao") notFound();

  const cabecalhos = await headers();
  const origem = origemDaRequisicao(cabecalhos);
  const abertura = quandoAbre(evento);
  /**
   * Os links de telão vivos — só os **ids**, nunca o token.
   *
   * O token existe uma vez, no instante da criação (`lib/acessos.ts` guarda o
   * hash). A tela lista que existe um link e oferece cancelar; quem perdeu o
   * endereço gera outro. Servir o token daqui exigiria guardá-lo em claro, e é
   * exatamente isso que o desenho evita.
   */
  const teloes = await listarAcessos(evento.id, "telao");

  return (
    <MateriaisDoQr
      dados={{
        eventoId: evento.id,
        nomeCasal: evento.nomeCasal,
        /**
         * O endereço por extenso, **sem esquema e sem `?o=`**. Ele é a única
         * retentativa que o passo 1 do fluxo tem quando o QR não lê
         * (`escopo-core.md` §1), e é o que o estado de erro entrega no lugar do
         * arquivo — por isso ele vem do servidor, e não é montado na tela.
         */
        endereco: enderecoParaLer(origem, evento.slug),
        // A mesma data que o convidado vê no álbum antes de a janela abrir,
        // calculada no mesmo lugar e no fuso do evento.
        abreEm: abertura.dia,
        origem,
        teloes: teloes.map(t => ({ id: t.id })),
        // O moderador vê os materiais e NÃO configura o evento: criar e revogar
        // link é `dia.configurar`. A rota já recusa; a tela não oferece o que
        // a rota nega, para ninguém tocar num botão que devolve 403.
        podeConfigurar: podeNoEvento(sessao, "dia.configurar", evento) !== "nao",
        ehDono: sessao.tipo === "casal" && sessao.acesso.dono,
      }}
    />
  );
}
