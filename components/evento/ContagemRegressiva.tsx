"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";

import { contagemAte, type ContagemRegressiva as Contagem } from "@/lib/datas";
import { largura, tipografiaNumeros } from "@/lib/tokens";

/**
 * Contagem regressiva até o casamento.
 *
 * DOIS DETALHES QUE PARECEM PREGUIÇA E SÃO O CONTRÁRIO:
 *
 * 1. `agoraInicialMs` vem do servidor. Sem isso, o servidor renderiza com o
 *    relógio dele e o cliente re-renderiza com o relógio dele, os segundos não
 *    batem, e o React acusa erro de hidratação em TODA visita. Com o valor
 *    vindo por prop, a primeira pintura do cliente é idêntica à do servidor, e
 *    só o efeito — que roda depois da hidratação — passa a usar o relógio real.
 *
 * 2. `tipografiaNumeros` liga `tabular-nums`. Sem ele o "1" é mais estreito que
 *    o "8", cada dígito que muda muda a largura do bloco, e a linha inteira
 *    treme a cada segundo. É o tipo de coisa que ninguém sabe nomear e todo
 *    mundo percebe.
 *
 * NÃO HÁ ANIMAÇÃO AQUI. O número troca, o texto troca, nada desliza — o design
 * system proíbe animação decorativa nesta página, e um laço infinito de animação
 * seria o oposto da promessa do produto (funcionar com wifi ruim, gastar pouca
 * bateria).
 */

type Props = {
  /** Instante do casamento, em ms desde a época. */
  alvoMs: number;
  /** "Agora" segundo o servidor, para a primeira pintura casar. */
  agoraInicialMs: number;
  /** O que aparece quando a data chegou. Ex.: "Casamos em 22 de agosto de 2027". */
  textoQuandoChegou: string;
};

const UNIDADES = [
  { chave: "dias", singular: "dia", plural: "dias" },
  { chave: "horas", singular: "hora", plural: "horas" },
  { chave: "minutos", singular: "minuto", plural: "minutos" },
  { chave: "segundos", singular: "segundo", plural: "segundos" },
] as const;

function resumoEmTexto(c: Contagem): string {
  return UNIDADES.map(u => {
    const valor = c[u.chave];
    return `${valor} ${valor === 1 ? u.singular : u.plural}`;
  }).join(", ");
}

export function ContagemRegressiva({ alvoMs, agoraInicialMs, textoQuandoChegou }: Props) {
  const [contagem, setContagem] = useState<Contagem>(() =>
    contagemAte(new Date(alvoMs), new Date(agoraInicialMs))
  );

  useEffect(() => {
    // Recalcula imediatamente: entre o instante em que o servidor renderizou e
    // o instante em que o navegador hidratou passaram segundos reais — no 4G,
    // às vezes muitos. Esperar o primeiro tique deixaria a contagem atrasada
    // por um segundo inteiro, visível.
    const atualizar = () => setContagem(contagemAte(new Date(alvoMs), new Date()));
    atualizar();

    const relogio = window.setInterval(atualizar, 1000);
    return () => window.clearInterval(relogio);
  }, [alvoMs]);

  if (contagem.chegou) {
    return (
      <Typography variant="h3" component="p" sx={{ color: "text.primary" }}>
        {textoQuandoChegou}
      </Typography>
    );
  }

  return (
    <Box
      // `role="timer"` com `aria-live="off"`: o leitor de tela anuncia o resumo
      // uma vez, ao chegar aqui, e NÃO relê a cada segundo. Uma contagem que
      // fala sozinha a cada tique torna a página inutilizável com leitor.
      role="timer"
      aria-live="off"
      aria-label={`Faltam ${resumoEmTexto(contagem)} para o casamento.`}
      sx={{ maxWidth: largura.texto, mx: "auto", width: "100%" }}
    >
      <Stack
        direction="row"
        // `aria-hidden` porque o `aria-label` acima já diz tudo isto em
        // português; sem ele, o leitor lê "22 dias 4 horas" duas vezes.
        aria-hidden
        sx={{ gap: { xs: 2, sm: 4 }, justifyContent: "center" }}
      >
        {UNIDADES.map(unidade => (
          <Stack key={unidade.chave} sx={{ minWidth: 56, alignItems: "center" }}>
            <Typography
              variant="h2"
              component="span"
              sx={{ ...tipografiaNumeros, color: "text.primary" }}
            >
              {contagem[unidade.chave]}
            </Typography>
            <Typography variant="overline" component="span" sx={{ color: "text.secondary" }}>
              {contagem[unidade.chave] === 1 ? unidade.singular : unidade.plural}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

export default ContagemRegressiva;
