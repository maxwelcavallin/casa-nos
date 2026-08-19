"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";

import { FolhaDoCta } from "@/components/album/FolhaDoCta";
import { FolhaDoLinkGuardado } from "@/components/album/FolhaDoLinkGuardado";
import { enviarEvento } from "@/lib/analytics";
import { marcarOrigemDoLoop } from "@/lib/origem-do-loop";
import { BOTAO_DO_CTA, CHAMADA_DO_CTA, TITULO_DO_LINK_GUARDADO } from "@/lib/textos-do-loop";
import { toque } from "@/lib/tokens";

/**
 * O RODAPÉ DE "AS MINHAS FOTOS" — o CTA do loop (H-16) e o link guardado (H-22).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **ABAIXO DA GRADE, E SÓ DEPOIS DE PELO MENOS UMA FOTO ARMAZENADA.**
 *
 * As duas condições são a regra do `escopo-core.md` §11.4 escrita como
 * renderização: *nada de aquisição acima do botão de mandar, e nada antes do
 * primeiro envio concluído*. Quem chamar este componente sem `temMidiaArmazenada`
 * não desenha nada — a decisão não fica na tela de cima, fica aqui, onde quem
 * lê o componente vê a regra junto com o que ela protege.
 *
 * **E ELE EXISTE EM UMA SUPERFÍCIE SÓ.** Não aparece no feed, em nenhuma forma e
 * em nenhum tamanho — nem como linha, nem como rodapé, nem como texto no estado
 * vazio (H-16, decisão R8 do `po`). O motivo, resumido: o feed é a primeira tela
 * que o convidado vê, **antes** de ele ter enviado qualquer coisa, que é o caso
 * exato que a regra descreve; e alcance de loop comprado com o denominador da
 * North Star é troca ruim, porque `k` é menor que 1 em todo cenário plausível.
 * `cta_surface = feed` não é emitido nesta fatia.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A ORDEM É CTA E DEPOIS LINK GUARDADO, e ela é do desenho: o CTA é sobre o
 * casamento da pessoa, e o link guardado é sobre as fotos que ela acabou de
 * mandar. Invertê-los faria a tela terminar falando de outro assunto.
 */

/** Quanto tempo visível antes de contar como "viu" (`metricas.md` §14.10). */
const SEGUNDO_DE_VISIBILIDADE_MS = 1000;

export type PropriedadesDoRodape = {
  eventoId: string;
  nomeCasal: string;
  /** `false` → o rodapé inteiro não existe. Ver o cabeçalho. */
  temMidiaArmazenada: boolean;
  aoAvisar: (recado: string) => void;
};

export function RodapeDoLoop({
  eventoId,
  nomeCasal,
  temMidiaArmazenada,
  aoAvisar,
}: PropriedadesDoRodape) {
  const [folhaDoCta, setFolhaDoCta] = useState(false);
  const [folhaDoLink, setFolhaDoLink] = useState(false);
  const alvo = useRef<HTMLDivElement | null>(null);

  /**
   * `growth_cta_viewed` — **uma vez por sessão e por superfície, e só depois de
   * 1 segundo visível**.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * SEM AS DUAS TRAVAS, O DENOMINADOR DO LOOP FICA MAIOR QUE O NÚMERO DE
   * CONVIDADOS. Uma rolagem para cima e para baixo cruza o elemento seis vezes;
   * seis "alcances" para uma pessoa fariam a taxa de clique parecer seis vezes
   * pior, e a correção óbvia — mexer no texto do botão — seria a errada.
   *
   * `sessionStorage` e não `localStorage`: a pergunta é "quantas pessoas viram
   * esta pergunta **nesta visita**", e uma marca permanente faria a segunda
   * abertura do álbum, no dia seguinte, não contar ninguém.
   *
   * O segundo de visibilidade separa "apareceu na tela" de "foi visto". Sem ele,
   * um elemento que passa voando durante uma rolagem rápida conta como alcance.
   * ─────────────────────────────────────────────────────────────────────────
   */
  useEffect(() => {
    if (!temMidiaArmazenada) return;
    const elemento = alvo.current;
    if (!elemento || typeof IntersectionObserver !== "function") return;

    const chave = `casa-nos:cta_viewed:${eventoId}:confirmacao_envio`;
    try {
      if (window.sessionStorage.getItem(chave)) return;
    } catch {
      // Sem `sessionStorage` (modo privado antigo), o evento simplesmente não
      // dispara. Contar sem a trava seria pior que não contar: um número inflado
      // é usado como se fosse verdade.
      return;
    }

    let temporizador: number | undefined;
    const observador = new IntersectionObserver(
      entradas => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting && temporizador === undefined) {
            temporizador = window.setTimeout(() => {
              try {
                window.sessionStorage.setItem(chave, "1");
              } catch {
                return;
              }
              enviarEvento("growth_cta_viewed", {
                wedding_id: eventoId,
                cta_surface: "confirmacao_envio",
              });
              observador.disconnect();
            }, SEGUNDO_DE_VISIBILIDADE_MS);
          } else if (!entrada.isIntersecting && temporizador !== undefined) {
            window.clearTimeout(temporizador);
            temporizador = undefined;
          }
        }
      },
      { threshold: 0.5 }
    );

    observador.observe(elemento);
    return () => {
      if (temporizador !== undefined) window.clearTimeout(temporizador);
      observador.disconnect();
    };
  }, [eventoId, temMidiaArmazenada]);

  // A regra do `escopo-core.md` §11.4, como renderização. Ver o cabeçalho.
  if (!temMidiaArmazenada) return null;

  return (
    <>
      <Stack ref={alvo} sx={{ gap: 1, pt: 2, alignItems: "flex-start" }}>
        <Typography variant="h6" component="p">
          {CHAMADA_DO_CTA}
        </Typography>
        <Button
          variant="outlined"
          onClick={() => {
            /**
             * A MARCA DE ORIGEM É GRAVADA NO TOQUE, e não no envio do
             * formulário: quem abre a folha e desiste continua tendo visto o
             * produto nesta festa, e é isso que o cadastro da Fatia 2 vai
             * querer saber.
             */
            marcarOrigemDoLoop(eventoId);
            enviarEvento("growth_cta_clicked", {
              wedding_id: eventoId,
              cta_surface: "confirmacao_envio",
            });
            setFolhaDoCta(true);
          }}
          sx={{ minHeight: toque.confortavel }}
        >
          {BOTAO_DO_CTA}
        </Button>

        <Button
          variant="text"
          onClick={() => setFolhaDoLink(true)}
          sx={{ minHeight: toque.confortavel }}
        >
          {TITULO_DO_LINK_GUARDADO}
        </Button>
      </Stack>

      <FolhaDoCta
        aberta={folhaDoCta}
        aoFechar={() => setFolhaDoCta(false)}
        eventoId={eventoId}
        superficie="confirmacao_envio"
        aoConcluir={aoAvisar}
      />

      <FolhaDoLinkGuardado
        aberta={folhaDoLink}
        aoFechar={() => setFolhaDoLink(false)}
        eventoId={eventoId}
        nomeCasal={nomeCasal}
        aoConcluir={aoAvisar}
      />
    </>
  );
}

export default RodapeDoLoop;
