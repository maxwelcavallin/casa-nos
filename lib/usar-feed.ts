"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ItemDoFeed } from "@/lib/feed";

/**
 * O FEED, NO CLIENTE (H-11) — busca, cursor e sondagem.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A SONDAGEM SÓ RODA COM A ABA VISÍVEL, e isso é regra do critério de aceite:
 * "o cliente pergunta a cada 5 s **enquanto a aba está visível** e para quando
 * não está". Uma aba de fundo perguntando a noite inteira gasta a bateria de um
 * aparelho que o convidado precisa que dure — e que é o mesmo aparelho que ainda
 * tem fotos na fila para subir.
 *
 * **NOVIDADE NÃO EMPURRA A TELA.** A sondagem devolve um número; ele vira um
 * botão *"12 fotos novas"* no topo. Quem decide quando as fotos entram é quem
 * está olhando — inserir sozinho moveria a foto que a pessoa está tocando.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const INTERVALO_MS = 5000;

export type EstadoDoFeed = {
  itens: ItemDoFeed[];
  carregando: boolean;
  /** Mensagem específica. `null` quando não houve erro. */
  erro: string | null;
  cursor: string | null;
  /** Quantas fotos novas esperam no topo. 0 → o botão não existe. */
  novas: number;
};

type RespostaDoFeed = { itens: ItemDoFeed[]; cursor: string | null };
type RespostaDeNovidades = { quantas: number; ate: string };

/**
 * A mensagem de erro do feed — **específica, e com o botão de mandar intacto**.
 *
 * O feed que não carrega **não** é o fim da tela: o botão de enviar nunca
 * dependeu dele (H-05), e o texto diz exatamente isso. "Falhou" não entra aqui,
 * como não entra em lugar nenhum do álbum.
 */
export const ERRO_DO_FEED =
  "Não conseguimos carregar as fotos agora. As suas você pode mandar do mesmo jeito.";

export function useFeed(eventoId: string, ativo: boolean) {
  const [estado, setEstado] = useState<EstadoDoFeed>({
    itens: [],
    /**
     * `carregando` NASCE VALENDO `ativo`, e é assim que a regra §6 do
     * `stack.md` continua cumprida sem um `return` de guarda dentro da busca.
     *
     * A regra existe para que nenhum caminho deixe a tela em esqueleto para
     * sempre. A forma canônica dela é "o guarda dentro do `try`, o desligamento
     * no `finally`" — mas aqui o guarda saiu para o efeito (ver abaixo), porque
     * um `return` síncrono antes do `finally` fazia `setEstado` rodar **dentro
     * do corpo do efeito**, que é uma cascata de renderização que o lint
     * recusa com razão.
     *
     * A invariante fica mais forte, e não mais fraca: **não existe caminho em
     * que `carregando` comece `true` e não seja desligado**, porque ele só
     * começa `true` quando a busca vai mesmo acontecer.
     */
    carregando: ativo,
    erro: null,
    cursor: null,
    novas: 0,
  });

  /** A marca de tempo da foto mais nova já mostrada. Base da sondagem. */
  const marca = useRef<string | null>(null);
  const buscando = useRef(false);

  const carregarPrimeiraPagina = useCallback(async () => {
    try {
      const resposta = await fetch(`/api/eventos/${eventoId}/feed`);
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as RespostaDoFeed;
      marca.current = corpo.itens[0]?.armazenadaEm ?? null;
      setEstado(anterior => ({
        ...anterior,
        itens: corpo.itens,
        cursor: corpo.cursor,
        erro: null,
        novas: 0,
      }));
    } catch {
      setEstado(anterior => ({ ...anterior, erro: ERRO_DO_FEED }));
    } finally {
      // O desligamento continua no `finally`, e continua sendo o único lugar
      // que o faz: erro, sucesso e exceção passam todos por aqui.
      setEstado(anterior => ({ ...anterior, carregando: false }));
    }
  }, [eventoId]);

  useEffect(() => {
    // O guarda mora aqui, e ele NÃO chama `setEstado`: sem participação, a
    // busca nem começa — e `carregando` já nasceu `false` por causa dela.
    if (!ativo) return;
    /**
     * EXCEÇÃO ESTREITA E ESCRITA, com o motivo.
     *
     * `react-hooks/set-state-in-effect` recusa qualquer função assíncrona que
     * chame `setState` e seja chamada de dentro de um efeito — **mesmo quando o
     * primeiro `setState` só acontece depois de um `await`**, que é o caso aqui.
     * Ela existe para pegar cascata de renderização; buscar dado na montagem não
     * é cascata, e não há outra forma de fazê-lo.
     *
     * O QUE CONTINUA GUARDADO, e é o que importava: `carregando` desliga no
     * `finally` e em lugar nenhum além dele. A catraca do design system mede
     * exatamente isso (`desligamento de carregando fora de finally`), e ela está
     * em zero — a regra que este arquivo precisa cumprir continua com dentes.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregarPrimeiraPagina();
  }, [ativo, carregarPrimeiraPagina]);

  /** Rolagem infinita: a próxima página, pelo cursor. */
  const carregarMais = useCallback(async () => {
    if (buscando.current) return;
    const cursor = estado.cursor;
    if (!cursor) return;
    buscando.current = true;
    try {
      const resposta = await fetch(
        `/api/eventos/${eventoId}/feed?cursor=${encodeURIComponent(cursor)}`
      );
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as RespostaDoFeed;
      setEstado(anterior => ({
        ...anterior,
        itens: [...anterior.itens, ...corpo.itens],
        cursor: corpo.cursor,
        erro: null,
      }));
    } catch {
      // Falhar ao buscar a PRÓXIMA página não apaga o que já está na tela e não
      // vira a mensagem de erro do feed inteiro: a pessoa continua vendo as
      // fotos que carregaram, e o botão de rolar tenta de novo.
    } finally {
      buscando.current = false;
    }
  }, [eventoId, estado.cursor]);

  /** Traz as novas para o topo. Chamado pelo botão, nunca sozinho. */
  const mostrarNovas = useCallback(async () => {
    setEstado(anterior => ({ ...anterior, novas: 0 }));
    await carregarPrimeiraPagina();
  }, [carregarPrimeiraPagina]);

  useEffect(() => {
    if (!ativo) return;

    let vivo = true;

    async function sondar() {
      // A aba de fundo não pergunta. `document.hidden` e não `visibilityState`
      // por brevidade: os dois dizem a mesma coisa aqui.
      if (document.hidden || !vivo) return;
      try {
        const desde = marca.current;
        const resposta = await fetch(
          `/api/eventos/${eventoId}/feed/novidades${desde ? `?desde=${encodeURIComponent(desde)}` : ""}`
        );
        if (!resposta.ok) return;
        const corpo = (await resposta.json()) as RespostaDeNovidades;
        if (!vivo) return;
        // A sondagem NUNCA acende a mensagem de erro do feed: ela é de fundo, e
        // um erro dela viraria um alerta sobre algo que a pessoa não pediu.
        if (corpo.quantas > 0) {
          setEstado(anterior => ({ ...anterior, novas: corpo.quantas }));
        }
      } catch {
        // Silêncio de propósito. Ver acima.
      }
    }

    const temporizador = setInterval(() => void sondar(), INTERVALO_MS);
    // Ao voltar para a aba, pergunta na hora: esperar 5 s depois de trazer a
    // aba de volta é a espera que a pessoa percebe.
    const aoVoltar = () => void sondar();
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      vivo = false;
      clearInterval(temporizador);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [eventoId, ativo]);

  return { estado, carregarMais, mostrarNovas, recarregar: carregarPrimeiraPagina };
}
