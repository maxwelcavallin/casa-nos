import { NextResponse } from "next/server";

import { respostaDeErro, rotaDeApi } from "@/lib/api";
import { pode } from "@/lib/autorizacao";
import { sql } from "@/lib/db";
import { registrarErro } from "@/lib/observabilidade";
import { sessaoDeCron } from "@/lib/sessao";

/**
 * A ROTA DE SAÚDE — a diferença entre READY e "o produto responde".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ELA TERIA PEGO, E POR ISSO ELA EXISTE.
 *
 * A `DATABASE_URL` ficou vazia por **seis deploys**. A plataforma mostrava
 * READY nos seis: o `next build` compila sem tocar no banco (o cliente Neon é
 * preguiçoso justamente para isso), o deploy sobe, o painel fica verde — e toda
 * página respondia 500 para quem abrisse. **A saúde do build não é a saúde do
 * produto**, e nada no caminho normal mede a segunda.
 *
 * O QUE ELA FAZ, e é o mínimo que responde a pergunta certa:
 *
 *   1. `select 1` — **a conexão de verdade**, no runtime de verdade, com a
 *      variável de verdade. Não é "a variável está definida": uma string
 *      presente e errada dá o mesmo READY.
 *   2. **Um evento é resolvido**, com a mesma consulta que a página pública usa.
 *      Sem isso, um banco vazio (ou apontado para o ambiente errado) responderia
 *      "ok" enquanto `/` responde 404 para todo mundo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O QUE ELA NÃO PEGA, e está escrito aqui de propósito.**
 *
 * Uma verificação que parece cobrir mais do que cobre é pior que nenhuma: ela
 * transfere a confiança sem transferir a garantia, e a próxima pessoa para de
 * olhar. Os quatro buracos, nomeados:
 *
 *   1. **Página que renderiza torta.** Ela não abre página nenhuma. Layout
 *      quebrado, seção fora de lugar, foto esticada — tudo passa em verde. Isso
 *      continua sendo olho humano no preview, e o `README` já diz que nenhum
 *      comando cobre layout.
 *   2. **Variável certa apontando para o banco errado.** Uma `DATABASE_URL`
 *      válida para o banco de desenvolvimento responde `ok: true` e
 *      `evento_resolvido: true` com um sorriso — e o casamento que o convidado
 *      abre é outro. Ela mede que HÁ banco, não QUAL banco.
 *   3. **O R2.** Ela não escreve nem lê no balde. Um `R2_PUBLIC_BASE` vazio
 *      deixa a galeria fora do ar com esta rota dizendo `ok`. Foi decisão: um
 *      teste de saúde que escreve num balde é um teste que suja produção todo
 *      dia, e o modo de falha do R2 já tem tratamento próprio (503 na tela,
 *      antes de a pessoa escolher o arquivo).
 *   4. **Lentidão.** `select 1` responde rápido num banco que está levando
 *      quinze segundos por consulta real.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **SEGREDO DE CABEÇALHO, o mesmo do cron** (`CRON_SEGREDO`). Não é dado
 * sensível o que ela devolve, mas dois booleanos sobre a infraestrutura de
 * produção não precisam ser públicos, e uma rota interna aberta é um alvo de
 * varredura barato. Sem `CRON_SEGREDO` configurado, a sessão nunca é
 * reconhecida — nunca "passa porque a variável está vazia".
 *
 * **A FALHA VIRA LINHA EM `eventos_de_erro`**, que é a tabela que uma pessoa lê.
 * Um cron que falha em silêncio é o comportamento padrão de cron, e a razão de
 * os seis deploys terem passado é exatamente essa: ninguém foi avisado.
 *
 * **`GET` e nada mais.** O agendador da Vercel só chama `GET`, e uma rota que
 * não escreve nada não tem por que aceitar outro método.
 */

const CAMINHO = "/api/interno/saude";

export const GET = rotaDeApi(CAMINHO, async pedido => {
  const sessao = sessaoDeCron(
    // As duas formas, como na reconciliação: `x-cron-segredo` é o que um
    // agendador externo usa, e `Authorization: Bearer` é o que a Vercel manda.
    pedido.headers.get("x-cron-segredo") ?? pedido.headers.get("authorization")
  );
  if (pode(sessao, "interno.cron") === "nao") {
    // 401 e não 403: quem chega sem o segredo não é uma sessão sem permissão, é
    // ninguém. E o corpo não diz o que existe do outro lado.
    return respostaDeErro(401, "nao autorizado");
  }

  try {
    /**
     * DUAS CONSULTAS, E NÃO UMA.
     *
     * `select 1` prova a conexão; a segunda prova que **há evento para
     * resolver**. Um banco novo, migrado e vazio passa na primeira e reprova na
     * segunda — e é esse o estado em que o produto responde 404 para todo mundo
     * enquanto a plataforma diz READY.
     */
    await sql`select 1 as um`;

    const linhas = await sql`
      select 1 as existe
        from eventos
       where excluido_em is null
       limit 1
    `;

    return NextResponse.json({ ok: true, evento_resolvido: linhas.length > 0 });
  } catch (falha) {
    /**
     * A LINHA DE ERRO É TENTADA MESMO ASSIM, e a ordem importa: se o que caiu
     * foi o banco, `registrarErro` não consegue gravar — e ela **nunca estoura**
     * (é a regra do arquivo dela), então sobra o `console`, que é o log da
     * plataforma. O caso que ela pega de verdade é o oposto: a consulta de
     * evento falhando com o banco de pé, que é a forma de a `0015` ter sido
     * aplicada pela metade.
     */
    await registrarErro({
      origem: "servidor",
      rota: CAMINHO,
      sessaoTipo: "cron",
      tipoErro: "servidor",
      classe: falha instanceof Error ? falha.name : typeof falha,
      mensagem: falha instanceof Error ? falha.message : String(falha),
      httpStatus: 503,
    });

    /**
     * **503, E NÃO 200 COM `ok: false`.** Um 200 mentiroso atravessa qualquer
     * monitor, qualquer retentativa e qualquer painel sem acender nada — que é
     * exatamente o defeito que esta rota existe para não repetir.
     */
    return NextResponse.json({ ok: false, evento_resolvido: false }, { status: 503 });
  }
});
