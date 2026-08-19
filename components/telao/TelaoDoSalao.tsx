"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useRef, useState } from "react";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { ChamadaQr } from "@/components/marca/ChamadaQr";
import { PalcoTelao } from "@/components/telao/PalcoTelao";
import { BUFFER_DO_TELAO, type FotoDoTelao } from "@/lib/feed";
import { corProjecao, duracao, escalaProjecao } from "@/lib/tokens";

/**
 * O TELÃO DO SALÃO (H-12) — **a tela mais perigosa do produto**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELA É PERIGOSA POR UM MOTIVO ESPECÍFICO, E ELE PRECISA ESTAR NO TOPO DO
 * ARQUIVO: **o erro dela é indistinguível do funcionamento normal.** Congelado e
 * rodando têm a mesma aparência da pista de dança. Não há usuário para reclamar
 * — ninguém "usa" um telão —, não há console que alguém vá abrir, e o
 * computador está atrás de uma mesa com um cabo HDMI.
 *
 * A consequência de desenho é o **silêncio absoluto**: perdeu a rede, perdeu o
 * servidor, o link foi revogado — ela continua rodando o buffer que já tem, sem
 * ícone, sem aviso, sem "reconectando", sem contorno piscando, sem nada em
 * `error` (que, medido, dá 1,80:1 deratado e seria ilegível de qualquer forma).
 * Uma mensagem de erro projetada num casamento é incidente, não estado.
 *
 * A consequência de engenharia é que a evidência tem que morar **em outro
 * lugar**: cada sondagem bem-sucedida carimba `evento_acessos.ultimo_uso_em`
 * (ver `lib/acessos.ts`), e a distância entre esse carimbo e agora é o que o
 * painel do dono lê. **A parede fica muda; o banco fala.**
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * AS NOVE PROIBIÇÕES DA PAREDE (§17.2), e nenhuma delas está aqui: branco puro,
 * preto puro, campo claro acima de 25% da área, cor de estado, aviso técnico /
 * ícone de erro / "reconectando" / logo girando / esqueleto / barra de
 * progresso, o monograma, `object-fit: cover`, movimento fora da fusão de
 * 600 ms, variante fora de `h1 · h2 · h3 · subtitle1 · body1`, contagem de
 * fotos, e qualquer coisa clicável.
 *
 * **NÃO EXISTE ESTADO DE CARREGANDO, e a ausência é a especificação.** O telão
 * entra direto na arte do vazio: o primeiro quadro e os primeiros 20 minutos são
 * a mesma imagem.
 *
 * **A JANELA DE ENVIO NÃO MUDA NADA AQUI** (`gtm.md` §5.8). O telão é a única
 * superfície que não ganha o par "chegou antes / foi encerrado": ele nunca conta
 * o estado do produto, nem erro, nem carregando, nem janela. Quem olha para ele
 * antes da festa é o casal testando, e a resposta para o casal mora no painel,
 * que é onde a janela foi configurada e onde dá para corrigi-la. Uma parede não
 * é lugar de contar que o produto ainda não está no ar.
 */

const INTERVALO_DE_SONDAGEM_MS = 5000;
/** Quanto tempo cada foto fica na parede. */
const TEMPO_POR_FOTO_MS = 8000;

export type PropriedadesDoTelao = {
  eventoId: string;
  nomeCasal: string;
  endereco: string;
  urlDoQr: string;
  /** A versão que este cliente carregou. Vazia desliga a verificação. */
  versaoInicial: string;
  /** O token, para o cabeçalho `x-telao`. Nunca vai para consulta nem para log. */
  token: string;
};

type RespostaDoTelao = { versao: string; fotos: FotoDoTelao[] };

export function TelaoDoSalao({
  eventoId,
  nomeCasal,
  endereco,
  urlDoQr,
  versaoInicial,
  token,
}: PropriedadesDoTelao) {
  /**
   * O BUFFER — as últimas N fotos **já baixadas**, e o teto é o que faz o telão
   * sobreviver a 6 horas.
   *
   * Sem teto, 4.000 fotos numa noite viram 4.000 entradas e 4.000 imagens no
   * cache do navegador de um computador emprestado. Com teto, a memória é
   * constante desde a primeira hora: entra uma, sai a mais velha.
   */
  const [buffer, setBuffer] = useState<FotoDoTelao[]>([]);
  /**
   * **O CICLO ANDA POR ID, E NÃO POR ÍNDICE**, e a diferença apareceu junto com
   * a reconciliação do buffer.
   *
   * Com a janela inteira chegando a cada 5 s, o buffer muda de tamanho e de
   * deslocamento o tempo todo: uma foto nova entra no fim, uma velha sai pela
   * frente. Um índice numérico passaria a apontar para **outra foto** a cada
   * sondagem, e a parede trocaria de imagem no meio do intervalo de 8 s — um
   * pulo de três metros, visível para 150 pessoas.
   *
   * Guardando o id, a foto que está no ar continua no ar enquanto existir. Se
   * ela sair (foi tirada do álbum), o `find` abaixo não a acha e a parede volta
   * para a primeira do buffer, que é o comportamento certo: a removida
   * simplesmente não volta.
   */
  const [idNoAr, setIdNoAr] = useState<string | null>(null);
  const versaoNoAr = useRef(versaoInicial);
  /**
   * O buffer, também em ref — lido pelo temporizador do ciclo.
   *
   * Sem ele, o efeito do ciclo dependeria de `buffer` e **recriaria o intervalo
   * a cada sondagem**: a cada 5 s o relógio de 8 s voltaria ao zero, e a foto
   * atual ficaria na parede para sempre. É escrito dentro de `sondar`, nunca
   * durante a renderização.
   */
  const bufferNoAr = useRef<FotoDoTelao[]>([]);

  const sondar = useCallback(async () => {
    try {
      /**
       * ─────────────────────────────────────────────────────────────────────
       * A SONDAGEM PEDE **A JANELA INTEIRA**, e não só o que chegou desde a
       * última — e a mudança conserta um defeito real da F1.4.
       *
       * Até aqui o cliente só ACRESCENTAVA: `?desde=` trazia as novas, e elas
       * entravam no fim do buffer. O efeito colateral era que **nada saía**. Uma
       * foto que o convidado tirou do feed (H-10), ou que o casal tirou do álbum
       * (H-13), continuava rodando na parede por até 8 minutos — o tempo de o
       * ciclo dar a volta nas 60 do buffer. A H-10 promete que a foto some do
       * feed **e do telão**, e a promessa estava valendo só na metade.
       *
       * Agora o buffer é **reconciliado**: o que a resposta não trouxer sai. O
       * custo é uma resposta de até 60 linhas a cada 5 s, para **um** cliente —
       * o computador do projetor —, com a borda cacheando 5 s. É o recurso mais
       * barato que este produto gasta, e ele compra a promessa inteira.
       * ─────────────────────────────────────────────────────────────────────
       */
      const resposta = await fetch(`/api/eventos/${eventoId}/telao`, {
        headers: { "x-telao": token },
      });
      if (!resposta.ok) return;
      const corpo = (await resposta.json()) as RespostaDoTelao;
      if (corpo.versao) versaoNoAr.current = corpo.versao;

      // A resposta vem da mais nova para a mais velha; a parede roda na ordem em
      // que a festa aconteceu.
      const janela = corpo.fotos
        .filter(foto => foto.previa)
        .reverse()
        .slice(-BUFFER_DO_TELAO);

      // Nada novo e nada removido: não mexer no estado evita uma renderização
      // por sondagem — 4.320 renderizações inúteis ao longo de uma noite.
      const anterior = bufferNoAr.current;
      const iguais =
        janela.length === anterior.length &&
        janela.every((foto, posicao) => foto.id === anterior[posicao].id);
      if (iguais) return;

      bufferNoAr.current = janela;
      setBuffer(janela);
    } catch {
      /**
       * SILÊNCIO. Este `catch` vazio é a especificação, e não uma omissão: perdeu
       * a rede, o telão continua rodando o que já tem. Um `console.error` aqui
       * também não ajuda ninguém — não há quem abra o console de um computador
       * atrás de uma mesa —, e um estado de erro na tela é proibido.
       */
    }
  }, [eventoId, token]);

  useEffect(() => {
    // Ver `lib/usar-feed.ts`: exceção estreita, com o motivo. A regra recusa
    // qualquer função assíncrona que chame `setState` e seja chamada de dentro
    // de um efeito, mesmo quando o `setState` só acontece depois de um `await`.
    // Aqui não há alternativa: a parede é uma tela que só busca dado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void sondar();
    const temporizador = setInterval(() => void sondar(), INTERVALO_DE_SONDAGEM_MS);
    return () => clearInterval(temporizador);
  }, [sondar]);

  /**
   * O CICLO. Um passo por `TEMPO_POR_FOTO_MS`, e **nunca a mesma foto em
   * sequência**: com uma foto só no buffer o id devolvido é o mesmo, o React não
   * re-renderiza, e nada pisca. Trocar uma foto por ela mesma seria uma fusão
   * cruzada de 600 ms que muda nada e aparece.
   *
   * O intervalo é criado **uma vez** e lê o buffer do ref. Dependendo de
   * `buffer`, ele seria recriado a cada sondagem — e o relógio de 8 s nunca
   * chegaria ao fim.
   */
  useEffect(() => {
    const temporizador = setInterval(() => {
      setIdNoAr(anterior => {
        const lista = bufferNoAr.current;
        if (lista.length === 0) return null;
        const posicao = lista.findIndex(foto => foto.id === anterior);
        return lista[(posicao + 1) % lista.length].id;
      });
    }, TEMPO_POR_FOTO_MS);
    return () => clearInterval(temporizador);
  }, []);

  /**
   * A VERIFICAÇÃO DE VERSÃO, e ela só dispara **com a tela vazia**.
   *
   * Recarregar no meio de uma foto é um piscar de três metros. Com o buffer
   * vazio a tela está na arte do vazio — parada, sem transição em curso —, e uma
   * recarga ali é invisível para o salão.
   */
  useEffect(() => {
    if (!versaoInicial || buffer.length > 0) return;
    const temporizador = setInterval(() => {
      if (versaoNoAr.current && versaoNoAr.current !== versaoInicial) {
        window.location.reload();
      }
    }, INTERVALO_DE_SONDAGEM_MS * 4);
    return () => clearInterval(temporizador);
  }, [versaoInicial, buffer.length]);

  /**
   * A foto no ar, derivada — sem efeito e sem escrita em ref durante a
   * renderização. O `?? buffer[0]` cobre os dois casos em que o id não existe
   * mais: a primeira foto da noite (ainda não houve ciclo) e a foto que acabou
   * de ser tirada do álbum.
   */
  const atual = buffer.find(foto => foto.id === idNoAr) ?? buffer[0] ?? null;

  return (
    <PalcoTelao>
      {/**
       * O único evento que o telão dispara é o `page_view`, com
       * `surface = telao` (H-12). É essa dimensão que faz o filtro de dados do
       * GA4 excluir esta tela de todo relatório: sem ele, o computador que fica
       * seis horas com a página aberta domina a contagem de sessões e contamina
       * toda média do casamento.
       */}
      <GoogleAnalytics eventoId={eventoId} superficie="telao" usuario={null} />

      {atual ? (
        <>
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Box
              // A chave força a troca de nó a cada foto — é o que dá o ponto de
              // partida da fusão. O DOM não cresce: há sempre **uma** imagem.
              key={atual.id}
              component="img"
              src={atual.previa ?? undefined}
              alt=""
              sx={{
                maxWidth: "100%",
                maxHeight: "100%",
                // `contain`, SEMPRE. `cover` corta rosto para 150 pessoas — numa
                // miniatura de grade cortar é aceitável; numa parede, não é.
                objectFit: "contain",
                // A moldura é uma FAIXA, nunca um fio: abaixo de 4 px de sinal a
                // linha vira franja colorida no projetor.
                border: `${escalaProjecao.moldura} solid`,
                borderColor: "divider",
                // Fusão cruzada de 600 ms — o mínimo confortável em projeção de
                // evento. Um corte de 200 ms numa área mil vezes maior não é lido
                // como transição, é lido como flash.
                animation: `aparecerNaParede ${duracao.projecao}ms ease-in-out`,
                "@keyframes aparecerNaParede": { from: { opacity: 0 }, to: { opacity: 1 } },
                // `prefers-reduced-motion` continua mandando: corte seco.
                "@media (prefers-reduced-motion: reduce)": { animation: "none" },
              }}
            />
          </Box>

          {/**
           * O rótulo de quem enviou, discreto e com véu.
           *
           * **Sem rótulo, NADA** — na parede não se escreve "Convidado". A
           * ausência é a especificação: um "Convidado" projetado em três metros
           * nomeia a falta de nome, e a pessoa que não se identificou não pediu
           * para ser anunciada assim.
           */}
          {atual.rotulo ? (
            <Typography
              variant="body1"
              component="p"
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                px: "1.5vw",
                py: "0.5vw",
                // Véu mais pesado que o da página (0.78 contra 0.62): o projetor
                // levanta o preto, e um véu leve deixa passar uma foto de céu
                // claro com o texto sumindo em cima.
                bgcolor: corProjecao.veu,
              }}
            >
              {atual.rotulo}
            </Typography>
          ) : null}

          {/**
           * O rodapé: marca à esquerda, chamada à direita. **Fora da área da
           * foto**, dentro da margem segura.
           */}
          <Stack
            direction="row"
            sx={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1.5vw",
            }}
          >
            <Typography variant="body1" component="p" sx={{ color: "text.secondary" }}>
              {/* "feito com", e não o nome sozinho: numa parede, um nome solto ao
                  lado de uma foto lê como patrocínio. É também a linha que já
                  existe no rodapé do site — uma marca, escrita de um jeito só. */}
              feito com casa-nos
            </Typography>
            <Stack direction="row" sx={{ alignItems: "center", gap: "1.5vw" }}>
              <Typography variant="subtitle1" component="p">
                Aponte a câmera
              </Typography>
              <Box
                sx={{
                  bgcolor: "background.paper",
                  p: "1vw",
                  width: "9vw",
                  borderRadius: "0.6vw",
                }}
              >
                <Box
                  component="img"
                  src={urlDoQr}
                  alt=""
                  sx={{ width: "100%", display: "block" }}
                />
              </Box>
            </Stack>
          </Stack>
        </>
      ) : (
        /**
         * A ARTE DO VAZIO — o primeiro quadro, os primeiros 20 minutos, e o
         * lugar para onde a tela volta se o buffer esvaziar (link revogado, por
         * exemplo). **Nunca uma tela de erro.**
         *
         * É o maior cartaz de aquisição do produto, e é a mesma arte que o casal
         * baixa em "Arte do telão" (H-04) — uma fonte, dois destinos.
         */
        <>
          <ChamadaQr
            densidade="telao"
            nomeCasal={nomeCasal}
            endereco={endereco}
            urlDoQr={urlDoQr}
          />
          <Typography
            variant="body1"
            component="p"
            sx={{ position: "absolute", left: 0, bottom: 0, color: "text.secondary" }}
          >
            feito com casa-nos
          </Typography>
        </>
      )}
    </PalcoTelao>
  );
}

export default TelaoDoSalao;
