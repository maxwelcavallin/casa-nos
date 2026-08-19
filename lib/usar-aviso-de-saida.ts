"use client";

import { createContext, useContext, useEffect } from "react";

/**
 * O AVISO DE ALTERAÇÃO NÃO SALVA (v1.0, V-15).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **ELA SUBIU DE `Should` PARA `Must` POR CAUSA DA GALERIA, e a razão não é
 * "perder texto é chato".** Nos editores de texto, sair sem salvar custava
 * reescrever um parágrafo: perda de trabalho, e o site continuava certo. No
 * editor da galeria a pessoa espera dois envios terminarem e digita a legenda
 * depois — sair ali deixa **uma foto publicada no site com a legenda errada ou
 * faltando**, sem sinal nenhum de que alguma coisa se perdeu. Perda que deixa
 * estado publicado errado não é a mesma coisa que perda que deixa campo vazio.
 *
 * **TRÊS SITUAÇÕES, E DUAS DELAS AVISAM COISAS DIFERENTES:**
 *
 *   `limpo`     — nada a perder, e **não aparece nada**. Um aviso que aparece
 *                 sempre vira mobília, e a pessoa aprende a atravessá-lo sem
 *                 ler — inclusive nas duas vezes em que ele importava.
 *
 *   `alterado`  — há texto digitado que o servidor não tem. O que se perde é o
 *                 que está na tela.
 *
 *   `enviando`  — **não é alteração não salva, e por isso não usa a mesma
 *                 frase.** A foto em curso já tem linha no banco, sem
 *                 `armazenada_em`: ela não renderiza no site e não conta. Quem
 *                 sair no meio não perde "o que digitou" — perde a foto, e
 *                 precisa mandá-la de novo. Dizer "alteração não salva" aqui
 *                 mandaria a pessoa procurar um botão de salvar que não existe.
 *
 * **O QUE ESTE GUARDA NÃO PEGA, escrito para não ser descoberto na marra:** o
 * botão *voltar* do navegador. O App Router não expõe interceptação de
 * navegação, e as gambiarras conhecidas (empilhar um estado falso no
 * `history`) quebram o próprio *voltar* de quem não tem alteração nenhuma —
 * custam mais do que consertam. O `beforeunload` cobre fechar a aba, recarregar
 * e sair do domínio; o diálogo cobre o único caminho de saída que o produto
 * desenha (o "Voltar para o site" da casca do editor).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type SituacaoDeSaida = "limpo" | "alterado" | "enviando";

/**
 * A casca do editor publica a função; o editor de dentro a chama.
 *
 * O contexto existe porque o estado do formulário mora no editor e o caminho de
 * saída — o "Voltar para o site" — mora na casca, que é quem o desenha. Sem
 * contexto, cada editor teria que desenhar o próprio botão de voltar, que é
 * exatamente o elemento que some quando cada tela desenha o seu.
 */
export const ContextoDeSaida = createContext<((situacao: SituacaoDeSaida) => void) | null>(
  null
);

/**
 * O NOME É `useAvisoDeSaida` E NÃO `usarAvisoDeSaida`, contra a convenção de
 * nomes em português deste projeto — a mesma exceção de `useSalvamento`: a regra
 * `react-hooks/rules-of-hooks` reconhece gancho pelo prefixo `use`, e um gancho
 * chamado `usarX` deixa de ser verificado por ela em silêncio.
 */
export function useAvisoDeSaida(situacao: SituacaoDeSaida): void {
  const avisar = useContext(ContextoDeSaida);

  useEffect(() => {
    avisar?.(situacao);
    // Ao desmontar (ou ao mudar de situação), a casca volta a "limpo" antes de
    // receber o valor novo. Sem isto, um editor que sai da tela deixaria a casca
    // achando que ainda há coisa por salvar.
    return () => avisar?.("limpo");
  }, [avisar, situacao]);

  useEffect(() => {
    if (situacao === "limpo") return;

    /**
     * FECHAR A ABA E RECARREGAR — o caminho que nenhum diálogo nosso alcança.
     *
     * O navegador mostra o texto **dele**, não o nosso: desde 2016 nenhum
     * navegador deixa a página escolher a frase, justamente porque a frase virou
     * chantagem em sites de saída. Não dá para dizer aqui que é a legenda que se
     * perde — e é por isso que este gancho existe **além** do diálogo, e não no
     * lugar dele.
     */
    const aoFechar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
    };

    window.addEventListener("beforeunload", aoFechar);
    return () => window.removeEventListener("beforeunload", aoFechar);
  }, [situacao]);
}

/**
 * A situação de um formulário simples: alterado quando o que está na tela
 * difere do que o servidor tem.
 *
 * Existe como função para os seis editores compararem do mesmo jeito. Comparar
 * por JSON é barato e suficiente aqui: os formulários deste painel têm menos de
 * dez campos de texto, e a alternativa — comparar campo a campo em cada editor —
 * é onde nasce o editor que esquece de comparar o campo novo.
 */
export function situacaoDoFormulario(atual: unknown, gravado: unknown): SituacaoDeSaida {
  return JSON.stringify(atual) === JSON.stringify(gravado) ? "limpo" : "alterado";
}
