"use client";

import { useCallback, useEffect, useState } from "react";

import type { MinhaMidia } from "@/lib/feed";

/**
 * "AS MINHAS FOTOS", NO CLIENTE (H-08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A LISTA SE ATUALIZA SOZINHA ENQUANTO A TELA ESTÁ ABERTA, e é isso que faz a
 * tela ser a confirmação do envio em vez de uma foto do passado: o convidado
 * acabou de tocar em "Mandar para a festa", a fila está subindo, e cada foto
 * troca de `chegando` para `ainda subindo` e depois para nada, sem ele recarregar
 * nada.
 *
 * A recarga é a mesma sondagem de 5 s do feed, **e só com a aba visível** — no
 * iOS a fila nem drena com a aba de fundo, então perguntar ali seria gastar
 * bateria para saber que nada mudou.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const INTERVALO_MS = 5000;

export type EstadoDeMinhas = {
  itens: MinhaMidia[];
  carregando: boolean;
  erro: string | null;
  cursor: string | null;
  total: number;
  /** Quantas ainda têm versão maior. Zero → o resumo do topo não existe. */
  originaisPendentes: number;
};

type Resposta = {
  itens: MinhaMidia[];
  cursor: string | null;
  total: number;
  originais_pendentes: number;
};

export const ERRO_DE_MINHAS =
  "Não conseguimos carregar as suas fotos agora. Elas continuam guardadas.";

export function useMinhas(eventoId: string, ativo: boolean) {
  const [estado, setEstado] = useState<EstadoDeMinhas>({
    itens: [],
    // Ver o comentário gêmeo em `usar-feed.ts`: `carregando` nasce valendo
    // `ativo`, e o guarda mora no efeito. Não existe caminho em que ele comece
    // `true` e não seja desligado.
    carregando: ativo,
    erro: null,
    cursor: null,
    total: 0,
    originaisPendentes: 0,
  });

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch(`/api/eventos/${eventoId}/minhas`);
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as Resposta;
      setEstado(anterior => ({
        ...anterior,
        itens: corpo.itens,
        cursor: corpo.cursor,
        total: corpo.total,
        originaisPendentes: corpo.originais_pendentes,
        erro: null,
      }));
    } catch {
      setEstado(anterior => ({ ...anterior, erro: ERRO_DE_MINHAS }));
    } finally {
      setEstado(anterior => ({ ...anterior, carregando: false }));
    }
  }, [eventoId]);

  useEffect(() => {
    if (!ativo) return;
    // Ver `usar-feed.ts`: exceção estreita, com o motivo. `carregando` continua
    // desligando só no `finally`, e a catraca do design system mede isso.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [ativo, carregar]);

  useEffect(() => {
    if (!ativo) return;
    const atualizar = () => {
      if (!document.hidden) void carregar();
    };
    const temporizador = setInterval(atualizar, INTERVALO_MS);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      clearInterval(temporizador);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [ativo, carregar]);

  /**
   * Troca a visibilidade de UMA foto, com o valor voltando ao anterior se
   * falhar.
   *
   * **NADA FICA "MEIO TROCADO"** (H-10, estado de erro). A troca é otimista — a
   * pessoa toca e vê o resultado —, e o `catch` devolve o valor antigo mais uma
   * mensagem específica. Um estado intermediário visível ("trocando…") seria
   * pior: ele responde a pergunta errada, porque o que ela quer saber é **quem
   * vê a foto agora**.
   */
  const trocarVisibilidade = useCallback(
    async (id: string, nova: MinhaMidia["visibilidade"]) => {
      const antes = estado.itens.find(item => item.id === id)?.visibilidade;
      if (!antes || antes === nova) return { mudou: false, de: antes ?? nova };

      setEstado(anterior => ({
        ...anterior,
        itens: anterior.itens.map(item =>
          item.id === id ? { ...item, visibilidade: nova } : item
        ),
      }));

      try {
        const resposta = await fetch(`/api/eventos/${eventoId}/midias/${id}/visibilidade`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ visibilidade: nova }),
        });
        if (!resposta.ok) throw new Error(String(resposta.status));
        const corpo = (await resposta.json()) as {
          visibilidade_anterior: MinhaMidia["visibilidade"];
          mudou: boolean;
        };
        return { mudou: corpo.mudou, de: corpo.visibilidade_anterior };
      } catch {
        setEstado(anterior => ({
          ...anterior,
          itens: anterior.itens.map(item =>
            item.id === id ? { ...item, visibilidade: antes } : item
          ),
        }));
        return { mudou: false, de: antes, falhou: true as const };
      }
    },
    [eventoId, estado.itens]
  );

  /**
   * Apaga. **Um toque, sem confirmação em dois passos** (H-10).
   *
   * Atrito para apagar é atrito na hora errada: quem quer tirar uma foto do
   * álbum de um casamento quer isso *agora*. A rede de segurança é o *Desfazer*
   * do toast, e a exclusão é lógica por 30 dias.
   */
  const apagar = useCallback(
    async (id: string) => {
      const antes = estado.itens;
      setEstado(anterior => ({
        ...anterior,
        itens: anterior.itens.filter(item => item.id !== id),
        total: Math.max(0, anterior.total - 1),
      }));
      try {
        const resposta = await fetch(`/api/eventos/${eventoId}/midias/${id}`, {
          method: "DELETE",
        });
        if (!resposta.ok) throw new Error(String(resposta.status));
        return true;
      } catch {
        setEstado(anterior => ({ ...anterior, itens: antes, total: antes.length }));
        return false;
      }
    },
    [eventoId, estado.itens]
  );

  return { estado, recarregar: carregar, trocarVisibilidade, apagar };
}
