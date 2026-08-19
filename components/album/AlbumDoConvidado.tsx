"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { AtalhoParaMandar, BarraDeEnvio } from "@/components/album/BarraDeEnvio";
import { CardMidia } from "@/components/album/CardMidia";
import { EnvioIndisponivel } from "@/components/album/EnvioIndisponivel";
import { FolhaDeEnvio, type PreviaLocal } from "@/components/album/FolhaDeEnvio";
import {
  ConviteDaGrade,
  EsqueletoDaGrade,
  GradeMidias,
} from "@/components/album/GradeMidias";
import { RegistrarServiceWorker } from "@/components/album/RegistrarServiceWorker";
import { EstadoVazio } from "@/components/EstadoVazio";
import { enviarEvento } from "@/lib/analytics";
import { ehVideo } from "@/lib/fila/maquina";
import { useFila } from "@/lib/fila/usar-fila";
import type { EstadoDoEnvio, QuandoAbre } from "@/lib/janela";
import type { Visibilidade } from "@/lib/midias";
import { largura, toque } from "@/lib/tokens";
import { useFeed } from "@/lib/usar-feed";

/**
 * O ÁLBUM DO CONVIDADO — o feed da festa (H-05, H-11) e a porta do envio (H-10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A PROMESSA DESTA TELA, e o que no código a sustenta:
 *
 * **"O botão de enviar não espera o feed."** Ele vive na `BarraDeEnvio`, que não
 * é renderizada depois de nada, não depende de estado remoto e não tem
 * `carregando`. Não é que ele carregue rápido — é que **não existe caminho de
 * código** em que ele dependa da rede. Com a rota do feed devolvendo erro, ele
 * continua funcional, porque ele nunca soube que existia uma rota de feed.
 *
 * **"Chegar ao botão custa no máximo dois passos de teclado."** `Tab` revela o
 * link de salto, que é o primeiro focável da página; `Enter` leva à região
 * *Mandar fotos*. Com 6.000 cards na grade, continuam sendo dois.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O FEED É INFRAESTRUTURA, NÃO ENFEITE (`escopo-core.md` §3.4): é ele que
 * mantém a aba aberta, e no iOS a fila só drena com a aba aberta. Por isso ele
 * está aqui, e por isso o erro dele **não** derruba o botão.
 *
 * LARGURA TRATADA por teto centralizado: `largura.app` (1120) com `mx: "auto"`.
 */

export type PropriedadesDoAlbum = {
  eventoId: string;
  slug: string;
  nomeCasal: string;
  participacaoId: string | null;
  faixaLenta: boolean;
  estadoDoEnvio: EstadoDoEnvio;
  abertura: QuandoAbre;
  /** Negativo antes da festa. Vai no `album_opened` (`metricas.md` §6). */
  diasDesdeOEvento: number;
  usuario: string | null;
};

export function AlbumDoConvidado({
  eventoId,
  slug,
  nomeCasal,
  participacaoId,
  faixaLenta,
  estadoDoEnvio,
  abertura,
  diasDesdeOEvento,
  usuario,
}: PropriedadesDoAlbum) {
  const roteador = useRouter();
  const { estado: estadoDaFila, enfileirar } = useFila(
    { eventoId, participacaoId, faixaLenta },
    eventoId
  );
  const podeEnviar = estadoDoEnvio === "aberto" && participacaoId !== null;

  const idDaGrade = useId();
  const { estado: feed, carregarMais, mostrarNovas } = useFeed(
    eventoId,
    participacaoId !== null
  );

  /**
   * `album_opened` dispara **uma vez por montagem**, e a marca é o `ref`.
   *
   * Sem ela, o efeito do React em desenvolvimento roda duas vezes e a abertura
   * de página valeria dois — e a permanência (S2) é justamente uma contagem de
   * aberturas. Um denominador inflado por modo de desenvolvimento é o tipo de
   * erro que ninguém percebe até comparar com o SQL.
   */
  const jaMediu = useRef(false);
  useEffect(() => {
    if (jaMediu.current) return;
    jaMediu.current = true;
    enviarEvento("album_opened", {
      wedding_id: eventoId,
      album_kind: "feed",
      days_since_event: diasDesdeOEvento,
    });
  }, [eventoId, diasDesdeOEvento]);

  /* ---------------- A escolha, e a folha dos dois botões ---------------- */

  const [escolhidos, setEscolhidos] = useState<File[]>([]);
  const [videosRecusados, setVideosRecusados] = useState(0);
  const [folhaAberta, setFolhaAberta] = useState(false);

  /**
   * As miniaturas locais, por `URL.createObjectURL`. **Antes de qualquer rede.**
   *
   * É o que faz a folha abrir com as fotos dentro no instante em que o seletor
   * do sistema fecha — não há esqueleto porque não há espera de rede para
   * esconder.
   */
  const previas: PreviaLocal[] = useMemo(
    () =>
      escolhidos.map((arquivo, indice) => ({
        chave: `${indice}:${arquivo.name}:${arquivo.size}`,
        url: typeof URL.createObjectURL === "function" ? URL.createObjectURL(arquivo) : null,
      })),
    [escolhidos]
  );

  useEffect(() => {
    // Cada `createObjectURL` segura o arquivo inteiro na memória até ser
    // revogado. Com 30 fotos de 4 MB isso são 120 MB presos num celular que já
    // está com dificuldade — e o navegador não os libera sozinho enquanto a aba
    // viver.
    return () => {
      for (const previa of previas) if (previa.url) URL.revokeObjectURL(previa.url);
    };
  }, [previas]);

  function aoEscolherArquivos(arquivos: File[]) {
    /**
     * VÍDEO É RECUSADO NO APARELHO (RN-12), e as fotos do mesmo lote seguem.
     *
     * Aqui, e não no servidor: o vídeo de 200 MB não pode nem começar a subir no
     * uplink do salão. A rota tem a mesma recusa (422), mas ela é a segunda
     * tranca — quando a primeira funciona, o vídeo nunca sai do celular.
     */
    const fotos = arquivos.filter(arquivo => !ehVideo(arquivo.type));
    setVideosRecusados(arquivos.length - fotos.length);
    setEscolhidos(fotos);
    setFolhaAberta(true);
  }

  async function aoEscolherVisibilidade(visibilidade: Visibilidade) {
    setFolhaAberta(false);
    await enfileirar(
      escolhidos.map(arquivo => ({
        arquivo,
        nome: arquivo.name,
        tipoArquivo: arquivo.type,
        bytes: arquivo.size,
      })),
      visibilidade
    );
    setEscolhidos([]);
    setVideosRecusados(0);

    /**
     * **O ENVIO TERMINA EM "AS MINHAS FOTOS"** (H-08, decisão V6/E1).
     *
     * Não existe tela intermediária de confirmação e não existe passo a mais: é
     * a mesma confirmação, com outro conteúdo. A pergunta do nome (H-09) abre
     * **lá**, com o envio já correndo — nunca aqui, antes dele.
     *
     * `push` e não `replace`: a volta do navegador leva ao feed, que é de onde
     * ela veio e onde a festa está acontecendo.
     */
    roteador.push(`/e/${slug}/album/minhas`);
  }

  /* ---------------- A área de conteúdo ---------------- */

  const conteudo = (() => {
    /**
     * A PRECEDÊNCIA DA JANELA, e ela é dura (`gtm.md` §5.1): quando a janela não
     * está aberta, a mensagem da janela **substitui** o estado vazio.
     *
     * `Seja a primeira foto da festa` sem botão é pior que um vazio — convida
     * para uma ação que não existe. O feed continua visível abaixo, se houver
     * algo: as fotos que já chegaram continuam sendo o conteúdo da tela.
     */
    const semEnvio = estadoDoEnvio !== "aberto";

    if (feed.carregando) return <EsqueletoDaGrade />;

    if (feed.erro) {
      return (
        <Stack sx={{ gap: 2, py: 4 }}>
          <Typography variant="body1">{feed.erro}</Typography>
          <Button
            variant="outlined"
            onClick={() => void mostrarNovas()}
            sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
          >
            Tentar de novo
          </Button>
        </Stack>
      );
    }

    if (feed.itens.length === 0) {
      if (semEnvio) {
        return <EnvioIndisponivel estado={estadoDoEnvio} abertura={abertura} />;
      }
      return (
        <ConviteDaGrade>
          <EstadoVazio
            densidade="convite"
            titulo="Seja a primeira foto da festa"
            corpo="O que você mandar aparece aqui e no telão, em segundos."
            apoio="Não precisa instalar nada."
          />
        </ConviteDaGrade>
      );
    }

    return (
      <Stack sx={{ gap: 2 }}>
        {semEnvio ? <EnvioIndisponivel estado={estadoDoEnvio} abertura={abertura} /> : null}

        {/* NOVIDADE NÃO EMPURRA A TELA: um botão no topo, e quem decide quando
            as fotos entram é quem está olhando. */}
        {feed.novas > 0 ? (
          <Button
            variant="contained"
            onClick={() => void mostrarNovas()}
            sx={{ alignSelf: "center", minHeight: toque.minimo }}
          >
            {feed.novas === 1 ? "1 foto nova" : `${feed.novas} fotos novas`}
          </Button>
        ) : null}

        <GradeMidias>
          {feed.itens.map(item => (
            <CardMidia
              key={item.id}
              miniatura={item.miniatura}
              // NENHUM SELO, EM EIXO NENHUM (RN-32e): "quem vê?" e "já chegou?"
              // não variam aqui, e marcar estado numa grade em que ele nunca
              // varia é ruído em 6.000 cards.
              noLote={item.noLote}
              rotulo={item.rotulo}
            />
          ))}
        </GradeMidias>

        {feed.cursor ? (
          <Button
            variant="text"
            onClick={() => void carregarMais()}
            sx={{ alignSelf: "center", minHeight: toque.confortavel }}
          >
            Ver mais fotos
          </Button>
        ) : (
          <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "center" }}>
            Você chegou ao começo da festa.
          </Typography>
        )}
      </Stack>
    );
  })();

  return (
    <>
      <GoogleAnalytics eventoId={eventoId} superficie="convidado" usuario={usuario} />
      <RegistrarServiceWorker />

      <Box
        component="main"
        sx={{
          maxWidth: largura.app,
          mx: "auto",
          px: { xs: 2, sm: 3 },
          pb: 12,
          minHeight: "100dvh",
        }}
      >
        <AtalhoParaMandar />

        <Stack component="header" sx={{ py: 3, gap: 0.5 }}>
          <Typography variant="h4" component="h1">
            {nomeCasal}
          </Typography>
          {/* A região da grade herda o nome DESTE texto por `aria-labelledby`.
              Uma string por nome, e nenhuma para desalinhar com o tempo: se o
              título mudar, o nome que o leitor de tela anuncia muda junto. */}
          <Typography id={idDaGrade} variant="caption" sx={{ color: "text.secondary" }}>
            Fotos da festa
          </Typography>
        </Stack>

        <Box
          component="section"
          role="region"
          aria-labelledby={idDaGrade}
          aria-busy={feed.carregando}
        >
          {conteudo}
        </Box>
      </Box>

      <BarraDeEnvio
        estadoDaFila={estadoDaFila}
        aoEscolherArquivos={podeEnviar ? aoEscolherArquivos : null}
        /**
         * `media_picker_opened` — o degrau entre "quis" e "conseguiu".
         *
         * `media_source: "galeria"` porque o campo abre o seletor do sistema, e
         * o produto não sabe se a pessoa vai usar a câmera ou a galeria antes de
         * o arquivo chegar. Declarar `camera` seria inventar; a origem de
         * verdade viaja depois, no `media_upload_succeeded`.
         */
        aoAbrirSeletor={
          podeEnviar
            ? () =>
                enviarEvento("media_picker_opened", {
                  wedding_id: eventoId,
                  media_source: "galeria",
                })
            : null
        }
      />

      <FolhaDeEnvio
        aberta={folhaAberta}
        aoFechar={() => {
          // Fechar a folha NÃO cancela nada — mas também não escolhe: sem toque
          // em um dos dois botões, não há envio.
          setFolhaAberta(false);
          setEscolhidos([]);
          setVideosRecusados(0);
        }}
        previas={previas}
        videosRecusados={videosRecusados}
        aoEscolher={visibilidade => void aoEscolherVisibilidade(visibilidade)}
      />
    </>
  );
}
