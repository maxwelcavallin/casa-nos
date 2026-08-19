import { sql, type Executor } from "@/lib/db";
import { paraBooleano, paraTextoObrigatorio } from "@/lib/serializar-linha";

/**
 * PUBLICAR E TIRAR DO AR (v1.0, V-11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **TIRAR DO AR NÃO APAGA NADA** (RV-13). `eventos.publicado = false` é estado, e
 * só isso: o texto, as fotos que o casal escreveu, as seções ligadas e a ordem
 * delas continuam exatamente onde estavam. Publicar de novo devolve o site
 * inteiro, sem reconstruir nada. É a mesma decisão de `evento_secoes.ativa`, e
 * pelo mesmo motivo: um botão que apaga é um botão que ninguém aperta.
 *
 * **O ENDEREÇO RESPONDE 404, E NÃO 403.** `buscarEventoPorSlug` e
 * `buscarEventoPorDominio` já exigem `publicado = true` desde a `0001` — não há
 * código novo para isso, e não deve haver. 403 diria ao visitante "este
 * casamento existe, você só não pode ver", que é informação sobre o casal que o
 * produto não tem por que dar a um estranho com um link antigo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** O que a rota aceita no corpo. `null` = corpo inválido, e a rota responde 400. */
export function conferirPublicacao(bruto: unknown): boolean | null {
  if (!bruto || typeof bruto !== "object") return null;
  const publicado = (bruto as Record<string, unknown>).publicado;
  // Só booleano de verdade. `"true"`, `1` e `"sim"` seriam três formas de o
  // cliente publicar um site sem querer, e a mais provável delas é a que vem de
  // um `<input>` que alguém ligou direto no `fetch`.
  return typeof publicado === "boolean" ? publicado : null;
}

export type ResultadoDaPublicacao = {
  /** O estado depois da escrita. */
  publicado: boolean;
  /**
   * **A TRANSIÇÃO ACONTECEU NESTA REQUISIÇÃO?**
   *
   * É o que decide se `site_published` é emitido (V-11): *"só na transição de
   * `false` para `true`, nunca a cada salvamento"*, e *"dois toques não geram
   * dois eventos"*. O GA4 não desconta evento duplicado, e o número de sites
   * publicados é o primeiro da árvore de aquisição — dobrá-lo é irreversível.
   */
  mudou: boolean;
};

/**
 * Grava a publicação e diz se ela MUDOU — numa instrução só.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE UMA INSTRUÇÃO, E NÃO "LÊ, COMPARA, ESCREVE":
 *
 * O driver HTTP do Neon executa **uma instrução por requisição, sem transação
 * abraçando o arquivo** (a mesma razão do `unnest` em `lib/secoes.ts`). Um
 * `select` seguido de um `update` são duas idas ao banco, e entre elas cabe o
 * segundo toque: os dois leem `publicado = false`, os dois gravam `true`, e os
 * dois concluem que houve transição. Dois eventos, de um toque duplo num botão
 * — que é exatamente o que o critério proíbe, e exatamente o que acontece num
 * celular com a rede lenta, onde o primeiro toque não dá retorno visível.
 *
 * O `where ... and publicado is distinct from ${publicado}` é o que fecha isso
 * **no banco**: quem chegar em segundo lugar espera o bloqueio da linha, revê a
 * condição depois de soltá-lo, encontra o valor já gravado e não atualiza nada.
 * `mudou` sai `false` sem depender de nenhuma trava no cliente.
 *
 * A CTE `alvo` existe para distinguir "não mudou" de "não existe": sem ela,
 * zero linhas afetadas significaria as duas coisas, e um `PATCH` no id de outro
 * casamento responderia 200. `alvo` devolve linha sempre que o evento existe, e
 * a rota responde 404 quando ela vem vazia.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `evento_id` vem sempre do evento já resolvido pelo servidor (`autorizar()`),
 * nunca do corpo da requisição — regra §8 de `dados.md`.
 */
export async function definirPublicacao(
  eventoId: string,
  publicado: boolean,
  exec: Executor = sql
): Promise<ResultadoDaPublicacao | null> {
  const linhas = await exec`
    with alvo as (
      select id
        from eventos
       where id = ${eventoId}
         and excluido_em is null
    ),
    escrita as (
      update eventos e
         set publicado = ${publicado},
             atualizado_em = now()
        from alvo
       where e.id = alvo.id
         and e.publicado is distinct from ${publicado}
      returning e.id
    )
    select alvo.id,
           ${publicado}::boolean as publicado,
           exists (select 1 from escrita) as mudou
      from alvo
  `;

  if (!linhas.length) return null;

  const linha = linhas[0];
  // A fronteira do banco, como em toda leitura: `boolean` do Postgres chega
  // como booleano, mas o `id` obrigatório é o que prova que a linha é a certa.
  paraTextoObrigatorio(linha.id, "eventos.id");
  return {
    publicado: paraBooleano(linha.publicado),
    mudou: paraBooleano(linha.mudou),
  };
}
