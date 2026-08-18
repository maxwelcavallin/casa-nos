import { neon } from "@neondatabase/serverless";

// Importado pelo efeito: registra o parser de `date` e `time` (lib/db-tipos.ts).
import "@/lib/db-tipos";

/**
 * Cliente Neon compartilhado — **um só no projeto inteiro**.
 *
 * Nunca `neon(process.env.DATABASE_URL!)` dentro de uma página ou de uma rota:
 * isso vira uma conexão por rota e some o ponto único de instrumentação, de
 * retry e do registro de tipos acima.
 *
 * A instância é preguiçosa de propósito. O `next build` roda sem
 * `DATABASE_URL` em vários ambientes; criar o cliente no topo do módulo faria o
 * build quebrar na importação, antes de qualquer consulta existir.
 */

/**
 * Assinatura mínima que este produto usa do driver: template marcado e
 * `.query()` para SQL montado em tempo de execução (o runner de migration).
 *
 * Ela é exportada porque é o contrato que `lib/eventos.ts` aceita por injeção —
 * é assim que o teste de vazamento entre inquilinos roda sem banco.
 */
export type Executor = {
  (
    strings: TemplateStringsArray,
    ...valores: unknown[]
  ): Promise<Record<string, unknown>[]>;
  query?: (
    texto: string,
    parametros?: unknown[]
  ) => Promise<Record<string, unknown>[]>;
};

let instancia: Executor | null = null;

function obterInstancia(): Executor {
  if (!instancia) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL não configurada. Veja .env.example e o README (seção 'Banco')."
      );
    }
    instancia = neon(url) as unknown as Executor;
  }
  return instancia;
}

export const sql: Executor = new Proxy(function () {} as unknown as Executor, {
  apply(_alvo, _this, argumentos) {
    return (obterInstancia() as (...a: unknown[]) => unknown)(...argumentos);
  },
  get(_alvo, propriedade) {
    return (obterInstancia() as unknown as Record<string | symbol, unknown>)[
      propriedade
    ];
  },
}) as Executor;
