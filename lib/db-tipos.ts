import { types } from "@neondatabase/serverless";

/**
 * Coluna `date` chega como texto puro, e não como instante.
 *
 * O DEFEITO QUE ISTO FECHA, e que neste produto seria visível para todo mundo:
 * o driver monta um `Date` na meia-noite do fuso do PROCESSO. A Vercel roda em
 * UTC, então `2027-08-22` viraria `2027-08-22T00:00:00.000Z` — e meia-noite em
 * UTC é 21h do dia 21 no Brasil. A página do casamento anunciaria **21 de
 * agosto** para a data que o casal cadastrou como 22.
 *
 * Não apareceria na máquina de quem desenvolve: aqui o processo roda em horário
 * de Brasília, o mesmo `date` vira `T03:00:00.000Z`, e a leitura em São Paulo dá
 * o dia certo. O erro só existe onde ninguém olha — no servidor de produção.
 *
 * `timestamptz` continua `Date`: ali a hora é informação de verdade. O que muda
 * é só o OID 1082, que é `date` e nunca teve hora nenhuma para perder.
 *
 * Vale como contrato de saída: quem consome uma data pura recebe `"2027-08-22"`
 * e formata com `lib/datas.ts`, sem passar por `new Date`.
 */
const OID_DATE = 1082;

/** `time` (sem fuso). Mesmo motivo: é texto `"16:30:00"`, não instante. */
const OID_TIME = 1083;

let registrado = false;

export function registrarTiposDoBanco(): void {
  if (registrado) return;
  types.setTypeParser(OID_DATE, (valor: string) => valor);
  types.setTypeParser(OID_TIME, (valor: string) => valor);
  registrado = true;
}

// Registra ao importar. `lib/db.ts` importa este módulo pelo efeito.
registrarTiposDoBanco();
