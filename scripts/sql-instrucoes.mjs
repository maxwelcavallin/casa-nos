/**
 * Separa um arquivo .sql em instrucoes.
 *
 * POR QUE ISTO NAO E `split(";")`: o driver HTTP do Neon executa UMA instrucao
 * por requisicao — mandar o arquivo inteiro devolve erro de sintaxe —, e um `;`
 * dentro de uma string, de um identificador entre aspas, de um comentario ou de
 * um corpo `$$ ... $$` nao termina instrucao nenhuma. `split(";")` funciona ate
 * a primeira funcao com corpo em `$$`, e ai quebra de um jeito que parece erro
 * do banco e manda quem investiga para o lugar errado.
 *
 * Mora num modulo separado do runner porque e a peca mais facil de errar do
 * processo de migration, e assim ela tem teste proprio (test/sql-instrucoes.test.ts).
 */
export function instrucoesDe(sqlBruto) {
  const instrucoes = []
  let atual = ""
  let i = 0
  let emAspaSimples = false
  let emAspaDupla = false
  let tagDolar = null

  while (i < sqlBruto.length) {
    const c = sqlBruto[i]
    const resto = sqlBruto.slice(i)

    if (tagDolar) {
      if (resto.startsWith(tagDolar)) {
        atual += tagDolar
        i += tagDolar.length
        tagDolar = null
        continue
      }
    } else if (emAspaSimples) {
      if (c === "'") emAspaSimples = false
    } else if (emAspaDupla) {
      if (c === '"') emAspaDupla = false
    } else {
      if (resto.startsWith("--")) {
        const fim = sqlBruto.indexOf("\n", i)
        i = fim === -1 ? sqlBruto.length : fim + 1
        continue
      }
      if (resto.startsWith("/*")) {
        const fim = sqlBruto.indexOf("*/", i)
        i = fim === -1 ? sqlBruto.length : fim + 2
        continue
      }
      const dolar = resto.match(/^\$[A-Za-z_]*\$/)
      if (dolar) {
        tagDolar = dolar[0]
        atual += tagDolar
        i += tagDolar.length
        continue
      }
      if (c === "'") emAspaSimples = true
      else if (c === '"') emAspaDupla = true
      else if (c === ";") {
        if (atual.trim()) instrucoes.push(atual.trim())
        atual = ""
        i++
        continue
      }
    }

    atual += c
    i++
  }

  if (atual.trim()) instrucoes.push(atual.trim())
  return instrucoes
}

