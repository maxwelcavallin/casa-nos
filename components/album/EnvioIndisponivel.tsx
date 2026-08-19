"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { EstadoDoEnvio, QuandoAbre } from "@/lib/janela";

/**
 * QUANDO O BOTÃO DE MANDAR NÃO EXISTE — e o texto que ocupa o lugar dele.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A PRECEDÊNCIA É DURA (`gtm.md` §5.1), e ela é a razão de este componente
 * existir em vez de o texto morar dentro de cada tela:
 *
 * > **Quando a janela não está aberta, a mensagem da janela SUBSTITUI o estado
 * > vazio, nos dois sentidos.**
 *
 * `Seja a primeira foto da festa` sem botão é **pior** que um vazio: é uma
 * promessa que a tela não pode cumprir, um convite para uma ação que não existe.
 * A regra vale nas duas telas que têm o botão de mandar — o feed e "as minhas
 * fotos" —, e são só estas duas.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **O BOTÃO SOME; ELE NÃO FICA DESABILITADO.** Botão desabilitado sem
 * explicação é a pessoa achando que o celular dela é o problema — e ela vai
 * tentar de novo, e vai tentar em outro aparelho, e vai perguntar para alguém no
 * meio da festa.
 *
 * A DIFERENÇA DE TOM ENTRE OS DOIS INSTANTES É DELIBERADA. **Antes**, a pessoa
 * ainda pode agir, e o texto termina numa ação (guardar o link e voltar).
 * **Depois**, ela não pode, e um texto que sugerisse ação seria falso. Nenhum
 * dos dois pede desculpa e nenhum dos dois diz "erro" — porque nada errado
 * aconteceu nas duas vezes.
 *
 * ELE NASCEU DE UM DEFEITO REAL: até a F1.2 os dois instantes opostos —
 * antevéspera e D+8 — mostravam a mesma frase, e quem lia o código de mesa na
 * antevéspera recebia *"Os envios deste casamento foram encerrados"*. Falso e
 * desanimador ao mesmo tempo, para quem tinha feito a coisa certa.
 */

export type PropriedadesDoEnvioIndisponivel = {
  estado: Exclude<EstadoDoEnvio, "aberto">;
  /** Quando a janela abre, no fuso do EVENTO. Só a mensagem de "antes" usa. */
  abertura: QuandoAbre;
};

/**
 * A frase da abertura. `As fotos abrem em 21 de agosto.` — e com hora
 * configurada diferente de meia-noite, `..., às 18:00.`
 *
 * A escolha entre as duas é feita pelo **dado** (`hora === null`), e não por um
 * `if` que alguém escreveu olhando o evento cobaia: um casal que abrir a janela
 * às 18h precisa ver o horário, e um que deixar o padrão de meia-noite não pode
 * ver "às 00:00", que soa como um detalhe técnico vazando para a tela.
 */
export function fraseDeAbertura(abertura: QuandoAbre): string {
  const quando = abertura.hora ? `${abertura.dia}, às ${abertura.hora}` : abertura.dia;
  return `As fotos abrem em ${quando}. Este link é o mesmo no dia: guarde e volte.`;
}

export function EnvioIndisponivel({ estado, abertura }: PropriedadesDoEnvioIndisponivel) {
  if (estado === "antes_da_janela") {
    return (
      <Stack sx={{ gap: 1, justifyContent: "center", py: 4 }}>
        {/* `h3` como o vazio do feed: é a voz da marca, e este texto ocupa o
            lugar dele. */}
        <Typography variant="h3" component="h2">
          Você chegou antes da festa
        </Typography>
        <Typography variant="body1">{fraseDeAbertura(abertura)}</Typography>
      </Stack>
    );
  }

  if (estado === "aparelho_novo_bloqueado") {
    return (
      <Stack sx={{ gap: 1, justifyContent: "center", py: 4 }}>
        <Typography variant="body1">
          Este álbum não está mais recebendo fotos novas.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack sx={{ gap: 1, justifyContent: "center", py: 4 }}>
      <Typography variant="body1">Os envios deste casamento foram encerrados.</Typography>
      {/* A segunda linha existe só aqui: ela responde "e as fotos que já
          chegaram?", que é a pergunta de quem chega depois — e que quem chega
          antes não faz. */}
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        As fotos que chegaram continuam aqui.
      </Typography>
    </Stack>
  );
}

export default EnvioIndisponivel;
