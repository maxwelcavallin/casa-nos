/**
 * Limite de taxa — em memória, por instância, e **honesto sobre o que é**.
 *
 * O QUE ELE É: um amortecedor. Ele impede que um laço acidental, um robô bobo ou
 * um `fetch` em recursão derrubem o banco na noite da festa.
 *
 * O QUE ELE NÃO É: uma defesa contra alguém decidido. A Vercel roda várias
 * instâncias, e cada uma tem a própria memória — dez requisições distribuídas
 * entre dez instâncias passam todas. Um limite de verdade exigiria Redis ou uma
 * escrita no Postgres por requisição; a segunda opção é uma escrita a cada
 * abertura de álbum, o que custa mais do que o problema que ela resolve, e a
 * primeira é uma dependência nova de infraestrutura que a Fatia 1 não pediu.
 *
 * ESCREVER ISSO É PARTE DA ENTREGA. Um limitador que parece proteger e não
 * protege é pior que nenhum: alguém confia nele e para de pensar no assunto.
 * Quando houver motivo — e o teste de carga da H-21 é quem vai dizer —, isto
 * vira um contador compartilhado, com a mesma interface.
 */

type Balde = { restante: number; renovaEm: number };

const baldes = new Map<string, Balde>();

/**
 * `true` quando pode passar.
 *
 * A limpeza é preguiçosa: baldes vencidos são reaproveitados quando a mesma
 * chave volta, e o mapa é zerado quando cresce demais. Um `setInterval` de
 * limpeza num ambiente sem servidor é um temporizador que segura a instância
 * viva sem nenhum motivo.
 */
export function permitir(chave: string, limite: number, janelaMs: number): boolean {
  const agora = Date.now();

  if (baldes.size > 5000) baldes.clear();

  const balde = baldes.get(chave);
  if (!balde || balde.renovaEm <= agora) {
    baldes.set(chave, { restante: limite - 1, renovaEm: agora + janelaMs });
    return true;
  }

  if (balde.restante <= 0) return false;
  balde.restante -= 1;
  return true;
}

/**
 * O identificador de quem está pedindo, para as rotas públicas.
 *
 * `x-forwarded-for` é o que a Vercel preenche com o IP real do visitante;
 * `request.ip` não existe no App Router. O primeiro da lista é o cliente — os
 * seguintes são proxies, e usar o último daria o IP da própria plataforma, o
 * mesmo para todo mundo.
 *
 * O IP **não é registrado em lugar nenhum**: ele só existe como chave em
 * memória, dentro desta requisição. Guardar IP de convidado de casamento seria
 * dado pessoal que o produto não tem por que ter.
 */
export function chaveDeOrigem(cabecalhos: Headers, sufixo: string): string {
  const encaminhado = cabecalhos.get("x-forwarded-for") ?? "";
  const primeiro = encaminhado.split(",")[0]?.trim();
  return `${primeiro || "desconhecido"}:${sufixo}`;
}

export const excedeuLimite = () =>
  Response.json({ erro: "muitas tentativas" }, { status: 429 });

/** Só para o teste: zera o estado entre casos. */
export function zerarLimites(): void {
  baldes.clear();
}
