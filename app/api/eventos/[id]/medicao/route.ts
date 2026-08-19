import { NextResponse } from "next/server";

import { autorizar, naoEncontrado, rotaDeApi } from "@/lib/api";
import { agoraNoServidor } from "@/lib/datas";
import { ehUuid } from "@/lib/ids";
import { medicaoDoDia, type Linha } from "@/lib/medicao";

/**
 * OS SETE NÚMEROS (H-19). **Só o dono** — nem o casal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A PERMISSÃO É `medicao.ver`, E ELA TEM UMA LINHA SÓ NA MATRIZ. Não é
 * privilégio de administrador: é a promessa do produto escrita como autorização.
 * *"O casal não trabalha durante a própria festa"* inclui **não olhar painel** —
 * e uma tela de medição que o casal consiga abrir é o produto convidando
 * exatamente o comportamento que ele promete evitar. Por isso ela também não é
 * linkada de nenhuma tela do painel do casal.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **CADA LINHA RESPONDE SOZINHA.** O corpo traz sete objetos, cada um com o
 * próprio `ok` — a linha que falhou vem `{"ok": false}` e a tela desenha o
 * travessão com o motivo, enquanto as outras seis mostram número. Uma resposta
 * única que estourasse por causa de uma consulta trocaria seis números certos
 * por uma tela de erro, às 23h, na única noite em que isso importa.
 *
 * `no-store`: o painel atualiza a cada 60 s e uma resposta cacheada mostraria o
 * número de cinco minutos atrás para quem está tentando decidir se age agora.
 */

const CAMINHO = "/api/eventos/[id]/medicao";

/** `{ok:true, valor}` vira `{ok:true, ...valor}` — a tela não desembrulha nada. */
function corpoDaLinha<T>(linha: Linha<T>): unknown {
  return linha.ok ? { ok: true, valor: linha.valor } : { ok: false };
}

export const GET = rotaDeApi(CAMINHO, async (_pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "medicao.ver");
  if (!acesso.ok) return acesso.resposta;

  const medicao = await medicaoDoDia(acesso.evento, agoraNoServidor());

  return NextResponse.json(
    {
      comecou: medicao.comecou,
      participacao: corpoDaLinha(medicao.participacao),
      midias: corpoDaLinha(medicao.midias),
      fila: corpoDaLinha(medicao.fila),
      erros: corpoDaLinha(medicao.erros),
      distribuicao: corpoDaLinha(medicao.distribuicao),
      moderacoes: corpoDaLinha(medicao.moderacoes),
      loop: corpoDaLinha(medicao.loop),
      /**
       * O sinal do telão **não é o oitavo número** — ele vive no cabeçalho da
       * tela, ao lado de "Atualiza a cada minuto". É o estado do instrumento, e
       * não o estado da festa: a parede é muda por especificação (nenhum erro
       * projetado num casamento), e `evento_acessos.ultimo_uso_em` é a única
       * evidência de que ela ainda está falando com o servidor.
       */
      telao: corpoDaLinha(medicao.telao),
    },
    { headers: { "cache-control": "no-store" } }
  );
});
