import { NextResponse } from "next/server";

import { autorizar, naoEncontrado, respostaDeErro, rotaDeApi } from "@/lib/api";
import { origemDaRequisicao } from "@/lib/enderecos";
import { ehUuid } from "@/lib/ids";
import { gerarLinkGuardado } from "@/lib/participacoes";
import { participacaoDaSessao } from "@/lib/sessao";

/**
 * O LINK GUARDADO (H-22) — a mitigação do R8, e não uma conta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `atual` NO CAMINHO, E NÃO UM ID — pela mesma razão da rota de identificação: a
 * participação de quem pede **é a do cookie**, e não algo que o corpo informa.
 * Com um id no caminho, esta rota precisaria conferir que o id é o de quem
 * pergunta; sem ele, a pergunta não existe. É a diferença entre uma verificação
 * que alguém pode esquecer e uma que não tem onde falhar.
 *
 * Por isso `participacao.recuperar` é `proprias` na matriz e não existe para o
 * casal: gerar o link de recuperação de um convidado seria o casal cunhando uma
 * credencial capaz de apagar as fotos dele.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **GERAR UM NOVO INVALIDA O ANTERIOR**, e a tela diz isso antes: `Este link novo
 * cancela o anterior.` A troca é um `update` só — ou ela acontece inteira, ou
 * não acontece —, e é o que torna verdadeira a mensagem de erro: *"Não
 * conseguimos gerar agora. O seu link anterior continua valendo."*
 *
 * **NENHUM TELEFONE É ARMAZENADO** (critério da história). O `wa.me` é montado na
 * tela e aberto pelo navegador; o número para quem a pessoa manda o link não
 * passa por este servidor. O corpo desta resposta é só o endereço.
 */

const CAMINHO = "/api/eventos/[id]/participacoes/atual/recuperacao";

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "participacao.recuperar");
  if (!acesso.ok) return acesso.resposta;

  const participacao = participacaoDaSessao(acesso.sessao);
  if (!participacao) return naoEncontrado();

  const token = await gerarLinkGuardado(acesso.evento.id, participacao.id);
  // Falhou: o anterior continua valendo, e é isso que a tela promete. 5xx e não
  // 4xx — não há nada errado no pedido, e tentar de novo é a atitude certa.
  if (!token) return respostaDeErro(503, "nao foi possivel gerar agora");

  const origem = origemDaRequisicao(pedido.headers);

  return NextResponse.json(
    {
      /**
       * O endereço completo, montado no servidor. A tela poderia concatenar
       * `location.origin`, e erraria no domínio próprio do casal: o produto
       * responde em `casa-nos.app` **e** no domínio que o casal comprou, e o
       * link guardado precisa apontar para onde a pessoa estava.
       */
      url: `${origem}/r/${token}`,
    },
    // Nunca cacheada: o corpo é uma credencial ao portador.
    { status: 201, headers: { "cache-control": "no-store" } }
  );
});
