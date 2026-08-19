"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { enviarEvento } from "@/lib/analytics";
import { armazemDoNavegador, pedirPersistencia } from "@/lib/fila/armazem";
import { gerarDerivadas, hashDoArquivo } from "@/lib/fila/derivadas";
import { criarMotor, type EstadoDaFila, type Escolha, type Motor } from "@/lib/fila/motor";
import { redeDoNavegador } from "@/lib/fila/rede";
import type { Visibilidade } from "@/lib/midias";

/**
 * A fila, ligada ao React.
 *
 * O motor não sabe que existe React, e é assim que ele é testável. Este arquivo
 * é a única cola: monta o motor com as implementações de navegador, guarda o
 * estado numa variável de tela e decide QUANDO drenar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OS QUATRO GATILHOS DE DRENAGEM, e por que quatro e não um temporizador:
 *
 * - `online`          — a rede voltou. É o gatilho que importa no salão.
 * - `visibilitychange`— a aba voltou à frente. **No iOS é o único que funciona**:
 *                       a aba em segundo plano não executa nada, e a fila só
 *                       anda quando o convidado volta para ela.
 * - temporizador      — o recuo crescente precisa de alguém para acordá-lo.
 * - montagem          — a retomada, que roda sozinha e sem perguntar.
 *
 * A interface **não promete segundo plano** em texto nenhum, e é por isso: no
 * Android a aba drena atrás; no iOS não drena. Prometer "enviando em segundo
 * plano" seria mentira em metade dos aparelhos, e a mentira aparece como foto
 * que não chegou.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const INTERVALO_MS = 5000;

export type ContextoDaTela = {
  eventoId: string;
  participacaoId: string | null;
  faixaLenta: boolean;
};

const VAZIA: EstadoDaFila = {
  pendentes: 0,
  maisVelhoEmSegundos: 0,
  situacao: "parada",
  retomados: 0,
};

/**
 * O carimbo da primeira abertura, para `seconds_since_scan`.
 *
 * `sessionStorage` e não `localStorage` de propósito (`metricas.md` §13.5): a
 * medida é "quanto tempo do QR até a primeira foto chegar", e ela é de uma
 * visita. Em `localStorage`, o convidado que voltasse no dia seguinte produziria
 * um `seconds_since_scan` de 20 horas — e a mediana que decide a ativação viraria
 * ficção.
 */
function primeiroAcesso(): number | null {
  try {
    const guardado = sessionStorage.getItem("cn:scan");
    if (guardado) return Number(guardado);
    const agora = Date.now();
    sessionStorage.setItem("cn:scan", String(agora));
    return agora;
  } catch {
    // Navegador com armazenamento bloqueado. Sem carimbo, o parâmetro não vai —
    // o que é melhor que ir errado.
    return null;
  }
}

/**
 * O ÚNICO NOME EM INGLÊS DESTE PRODUTO, e ele tem motivo.
 *
 * O `eslint-plugin-react-hooks` reconhece um gancho pelo prefixo `use` — é assim
 * que ele sabe onde aplicar as regras de ordem de chamada. Um gancho chamado
 * `usarFila` fica FORA da verificação, e o arquivo que ficaria de fora é
 * justamente o que segura a fila de envio: hook dentro de condicional aqui é a
 * classe de defeito que aparece como "às vezes a foto não sobe".
 *
 * Perder a regra para manter o português seria trocar uma verificação real por
 * uma coerência de vocabulário. O resto do arquivo continua em português.
 */
export function useFila(contexto: ContextoDaTela, weddingId: string) {
  const [estado, setEstado] = useState<EstadoDaFila>(VAZIA);
  const [carregando, setCarregando] = useState(true);
  const motorRef = useRef<Motor | null>(null);

  useEffect(() => {
    let vivo = true;

    /**
     * O guarda está DENTRO do `try`, e isso é a regra §6 do `stack.md`.
     *
     * Sem participação não há fila — mas o `return` precisa passar pelo
     * `finally`. Um `return` antes dele deixaria `carregando` ligado para
     * sempre: a tela ficaria em esqueleto, sem erro, sem nada no console, e
     * ninguém abriria chamado porque parece "lento". Já aconteceu duas vezes em
     * produtos desta casa.
     */
    (async () => {
      try {
        if (!contexto.participacaoId) return;

        const motor = criarMotor(
          {
            armazem: armazemDoNavegador(),
            rede: redeDoNavegador(),
            agora: () => Date.now(),
            medir: enviarEvento,
            gerarDerivadas,
            hashDoArquivo,
            novoId: () => crypto.randomUUID(),
            online: () => navigator.onLine,
            aoMudar: novo => {
              if (vivo) setEstado(novo);
            },
          },
          {
            eventoId: contexto.eventoId,
            participacaoId: contexto.participacaoId,
            weddingId,
            faixaLenta: contexto.faixaLenta,
            primeiroAcessoEm: primeiroAcesso(),
          }
        );
        motorRef.current = motor;

        // A recusa não quebra nada, e é o caso comum: quase todo navegador nega
        // sem interação prévia. O pedido existe porque, sem persistência, o
        // sistema pode limpar o IndexedDB sob pressão de espaço — num celular
        // cheio de fotos, que é o aparelho do convidado.
        void pedirPersistencia();

        // Retomada: sozinha, sem perguntar (H-07).
        await motor.retomar();
      } catch (falha) {
        /**
         * SEM INDEXEDDB O ÁLBUM CONTINUA ABRINDO, e o botão continua funcionando.
         *
         * O caso real é o Firefox em janela privada, que simplesmente não tem
         * IndexedDB — `indexedDB.open` estoura, e sem este `catch` a promessa
         * rejeitaria, a tela ficaria com o estado inicial e ninguém saberia por
         * quê. O que se perde é a fila persistente (o envio passa a depender de
         * a aba continuar aberta); o que não se pode perder é a tela.
         */
        console.warn("[casa-nos] fila local indisponivel neste navegador", falha);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [contexto.eventoId, contexto.participacaoId, contexto.faixaLenta, weddingId]);

  useEffect(() => {
    const drenar = () => void motorRef.current?.drenar();
    const temporizador = setInterval(drenar, INTERVALO_MS);
    window.addEventListener("online", drenar);
    document.addEventListener("visibilitychange", drenar);

    // `pagehide` e não `beforeunload`: `beforeunload` não dispara de forma
    // confiável no Safari do iOS, que é metade do público desta festa.
    const aoSair = () => void motorRef.current?.aoSair();
    window.addEventListener("pagehide", aoSair);

    return () => {
      clearInterval(temporizador);
      window.removeEventListener("online", drenar);
      document.removeEventListener("visibilitychange", drenar);
      window.removeEventListener("pagehide", aoSair);
    };
  }, []);

  const enfileirar = useCallback(
    async (escolhas: Escolha[], visibilidade: Visibilidade) => {
      const motor = motorRef.current;
      if (!motor) return { enfileirados: 0, videosRecusados: 0, semPreviaLocal: 0 };
      // `galeria` porque o seletor do sistema é o caminho desta fatia. A câmera
      // direta (`capture`) é outra história e outro parâmetro — não se adivinha
      // origem, porque `media_source` é dimensão do GA4 e valor errado nela não
      // se limpa depois.
      const resultado = await motor.enfileirar(escolhas, { visibilidade, origem: "galeria" });
      await motor.drenar();
      return resultado;
    },
    []
  );

  return { estado, carregando, enfileirar, drenar: () => motorRef.current?.drenar() };
}
