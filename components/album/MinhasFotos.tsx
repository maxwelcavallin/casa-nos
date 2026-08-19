"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { AtalhoParaMandar, BarraDeEnvio } from "@/components/album/BarraDeEnvio";
import { CardMidia } from "@/components/album/CardMidia";
import { EnvioIndisponivel } from "@/components/album/EnvioIndisponivel";
import { FolhaDeEnvio, type PreviaLocal } from "@/components/album/FolhaDeEnvio";
import { FolhaDaFoto } from "@/components/album/FolhaDaFoto";
import { RodapeDoLoop } from "@/components/album/RodapeDoLoop";
import { EsqueletoDaGrade, GradeMidias } from "@/components/album/GradeMidias";
import { ResumoDoTopo } from "@/components/album/ResumoDoTopo";
import {
  SeletorNomeConvidado,
  type ResultadoDaIdentificacao,
} from "@/components/album/SeletorNomeConvidado";
import { RegistrarServiceWorker } from "@/components/album/RegistrarServiceWorker";
import { EstadoVazio } from "@/components/EstadoVazio";
import { enviarEvento } from "@/lib/analytics";
import type { ConvidadoPublico } from "@/lib/convidados";
import type { MinhaMidia } from "@/lib/feed";
import { ehVideo } from "@/lib/fila/maquina";
import { useFila } from "@/lib/fila/usar-fila";
import type { EstadoDoEnvio, QuandoAbre } from "@/lib/janela";
import type { Visibilidade } from "@/lib/midias";
import { largura, toque } from "@/lib/tokens";
import { useMinhas } from "@/lib/usar-minhas";

/**
 * "AS MINHAS FOTOS" (H-08) — **a tela de confirmação do envio**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELA CHEGA NO LUGAR DE UM "ENVIADO COM SUCESSO" (decisão V6/E1). Tocar num dos
 * dois botões de envio leva aqui, com as fotos do lote já listadas como
 * chegando. Não existe tela intermediária e não existe passo a mais: **é a mesma
 * confirmação, com outro conteúdo.**
 *
 * A GUARDA MEDIDA, e ela é do `po`: se a mediana de `seconds_since_scan` na
 * faixa `previa` passar de 30 s no ensaio, esta história é revertida para "o
 * envio volta ao feed". Ativação comprada às custas do núcleo é perda disfarçada
 * de ganho.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CADA FOTO RESPONDE A DUAS PERGUNTAS, E AS DUAS RESPOSTAS CONVIVEM (RN-32):
 * "quem vê isso?" no canto inferior esquerdo, **em 100% das fotos**, inclusive
 * enquanto elas sobem; "já chegou?" no canto superior direito, e só enquanto
 * ainda há o que acontecer. O canto vazio significa que terminou — é por isso
 * que nenhuma palavra terminal precisa existir ali.
 *
 * NUNCA "AGUARDANDO APROVAÇÃO": o convidado não vê a fila de moderação, em
 * resposta de API nenhuma e em tela nenhuma (RN-07). Para ele, enviado é
 * enviado.
 */

export type PropriedadesDeMinhas = {
  eventoId: string;
  slug: string;
  /** Para a mensagem pronta do `wa.me` no link guardado (H-22). */
  nomeCasal: string;
  participacaoId: string | null;
  faixaLenta: boolean;
  estadoDoEnvio: EstadoDoEnvio;
  abertura: QuandoAbre;
  diasDesdeOEvento: number;
  /** A lista do evento, servida inteira e usada só no cliente (decisão P7). */
  convidados: ConvidadoPublico[];
  /** O rótulo que esta participação já tem, se tiver. */
  rotuloAtual: string | null;
  /** `true` quando esta participação ainda não disse quem é. */
  precisaSeIdentificar: boolean;
  usuario: string | null;
};

const ERRO_DA_TROCA =
  "Não conseguimos mudar agora. Continua {estado}. Tente de novo em instantes.";

export function MinhasFotos({
  eventoId,
  slug,
  nomeCasal,
  participacaoId,
  faixaLenta,
  estadoDoEnvio,
  abertura,
  diasDesdeOEvento,
  convidados,
  rotuloAtual,
  precisaSeIdentificar,
  usuario,
}: PropriedadesDeMinhas) {
  const idDaGrade = useId();
  const { estado: estadoDaFila, enfileirar } = useFila(
    { eventoId, participacaoId, faixaLenta },
    eventoId
  );
  const { estado, trocarVisibilidade, apagar, recarregar } = useMinhas(
    eventoId,
    participacaoId !== null
  );
  const podeEnviar = estadoDoEnvio === "aberto" && participacaoId !== null;

  /**
   * A RECONCILIAÇÃO NO GATILHO QUE MAIS IMPORTA (H-15): **a participação reabre
   * o álbum**.
   *
   * Quem reabre "as minhas fotos" é justamente quem tinha foto na fila. O `PUT`
   * no R2 é o passo que consome o uplink inteiro; o `POST` de confirmação é o
   * que falha depois dele, quando a rede já acabou. A pessoa fecha a aba achando
   * que perdeu, volta no dia seguinte — e é aqui que a foto dela é adotada.
   *
   * **Ela não é anunciada.** Nenhum "recuperamos 3 fotos": para a convidada a
   * foto simplesmente está lá, e transformar um acerto invisível numa notícia é
   * contar que algo tinha dado errado. O que a resposta muda é a grade, que
   * recarrega.
   */
  const jaReconciliou = useRef(false);
  useEffect(() => {
    if (jaReconciliou.current || participacaoId === null) return;
    jaReconciliou.current = true;
    (async () => {
      try {
        const resposta = await fetch(
          `/api/eventos/${eventoId}/participacoes/atual/reconciliar`,
          { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }
        );
        if (!resposta.ok) return;
        const corpo = (await resposta.json()) as { recarregar: boolean };
        if (corpo.recarregar) await recarregar();
      } catch {
        /**
         * Silêncio. A reconciliação é conserto oportunista: se ela não rodar
         * agora, o cron diário roda às 12:00 UTC. Contar a falha na tela seria
         * contar à convidada um problema que ela não tem como resolver, sobre
         * uma foto que ela nem sabe que ficou para trás.
         */
      }
    })();
  }, [eventoId, participacaoId, recarregar]);

  const jaMediu = useRef(false);
  useEffect(() => {
    if (jaMediu.current) return;
    jaMediu.current = true;
    enviarEvento("album_opened", {
      wedding_id: eventoId,
      album_kind: "minhas",
      days_since_event: diasDesdeOEvento,
    });
  }, [eventoId, diasDesdeOEvento]);

  /* ---------------- H-09 · o nome, perguntado depois ---------------- */

  /**
   * A FOLHA DE IDENTIFICAÇÃO ABRE SOZINHA, **com o envio já correndo**.
   *
   * Ela abre aqui e não no feed porque a ordem é essa: o convidado toca em
   * enviar, a fila começa, ele cai nesta tela, e **então** a pergunta aparece.
   * Nenhum passo novo entra no fluxo dele (regra N11 da estratégia): fechar a
   * folha mantém o envio e credita as fotos a "Convidado".
   */
  const [folhaDoNome, setFolhaDoNome] = useState(precisaSeIdentificar);
  const [avisoDoNome, setAvisoDoNome] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  const identificar = useCallback(
    async (resultado: ResultadoDaIdentificacao) => {
      try {
        const resposta = await fetch(`/api/eventos/${eventoId}/participacoes/atual`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            modo_identificacao: resultado.modo,
            rotulo: resultado.rotulo,
            ...(resultado.modo === "lista" ? { convidado_id: resultado.convidadoId } : {}),
          }),
        });
        if (!resposta.ok) throw new Error(String(resposta.status));
        const corpo = (await resposta.json()) as {
          rotulo: string | null;
          modo_identificacao: "lista" | "avulso" | "retomado";
        };
        setFolhaDoNome(false);
        setAvisoDoNome(null);
        // O modo vem do SERVIDOR: um `convidado_id` que não é deste evento cai
        // para `avulso`, e mandar o modo pedido faria a dimensão do GA4 contar
        // um `lista` que não existe.
        enviarEvento("guest_identified", {
          wedding_id: eventoId,
          identification_mode: corpo.modo_identificacao,
        });
        if (corpo.rotulo) setRecado(`Pronto, ${corpo.rotulo}. Suas fotos estão chegando.`);
      } catch {
        /**
         * O ERRO DO RÓTULO **NUNCA** DESFAZ O ENVIO E NUNCA BLOQUEIA A FOLHA.
         * O que aconteceu foi o adiamento de um dado secundário enquanto a coisa
         * principal — as fotos — segue. Por isso `warningBg` na folha, e não
         * `errorBg`.
         */
        setAvisoDoNome("Guardamos as suas fotos. O nome a gente tenta de novo.");
      }
    },
    [eventoId]
  );

  /* ---------------- H-10 · a visibilidade, e apagar ---------------- */

  const [emFoco, setEmFoco] = useState<MinhaMidia | null>(null);

  async function trocar(nova: Visibilidade) {
    const alvo = emFoco;
    setEmFoco(null);
    if (!alvo) return;
    const saida = await trocarVisibilidade(alvo.id, nova);
    if ("falhou" in saida && saida.falhou) {
      setRecado(
        ERRO_DA_TROCA.replace(
          "{estado}",
          // O texto traz o estado ANTERIOR por extenso, porque o convidado
          // precisa saber **quem vê a foto agora** — que é a pergunta dele —, e
          // não o que deixou de acontecer.
          alvo.visibilidade === "feed" ? "na festa" : "só para os noivos"
        )
      );
      return;
    }
    if (saida.mudou) {
      enviarEvento("media_visibility_changed", {
        wedding_id: eventoId,
        media_visibility_from: saida.de,
        media_visibility: nova,
      });
      if (nova === "noivos") setRecado("Agora só os noivos veem esta foto.");
    }
  }

  /**
   * BAIXAR (H-20). Duas idas: a rota assina, o navegador busca.
   *
   * O arquivo **não passa pela função** — ela devolve uma URL assinada de 15
   * minutos e o navegador vai direto ao balde. Fazer proxy de 90 MB dentro de
   * uma função serverless é memória, tempo e um limite de resposta da
   * plataforma, e o caso "cheio" da história é exatamente uma foto de 90 MB.
   */
  async function baixarFoto(id: string) {
    try {
      const resposta = await fetch(`/api/eventos/${eventoId}/midias/${id}/download`);
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as { url: string };
      window.location.href = corpo.url;
    } catch {
      // O botão continua na tela: quem falhou foi o pedido, não a foto.
      setRecado("Não conseguimos preparar o download agora. Tente de novo em instantes.");
    }
  }

  async function apagarFoto(id: string) {
    setEmFoco(null);
    const foi = await apagar(id);
    setRecado(
      foi
        ? "Apagamos a sua foto. Ela sai do álbum e do telão, mas quem já viu, já viu."
        : "Não conseguimos apagar agora. A foto continua no álbum. Tente de novo em instantes."
    );
  }

  /* ---------------- O envio, de novo, a partir daqui ---------------- */

  const [escolhidos, setEscolhidos] = useState<File[]>([]);
  const [videosRecusados, setVideosRecusados] = useState(0);
  const [folhaDeEnvio, setFolhaDeEnvio] = useState(false);

  const previas: PreviaLocal[] = escolhidos.map((arquivo, indice) => ({
    chave: `${indice}:${arquivo.name}:${arquivo.size}`,
    url: typeof URL.createObjectURL === "function" ? URL.createObjectURL(arquivo) : null,
  }));

  async function mandar(visibilidade: Visibilidade) {
    setFolhaDeEnvio(false);
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
    // Já estamos em "as minhas fotos": não há para onde ir. O que muda é a
    // lista, e ela vem da recarga.
    await recarregar();
  }

  /* ---------------- A grade ---------------- */

  const conteudo = (() => {
    if (estado.carregando) {
      /**
       * O ESQUELETO TEM O NÚMERO REAL DE FOTOS ESCOLHIDAS, e não 12 genéricos:
       * os itens do lote **já existem localmente**, na fila. É o que faz a tela
       * abrir com a forma do que vai aparecer, em vez de com a forma de uma
       * grade qualquer.
       */
      return <EsqueletoDaGrade quantos={Math.max(1, estadoDaFila.pendentes || 6)} />;
    }

    if (estado.erro) {
      return (
        <Stack sx={{ gap: 2, py: 4 }}>
          <Typography variant="body1">{estado.erro}</Typography>
          <Button
            variant="outlined"
            onClick={() => void recarregar()}
            sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
          >
            Tentar de novo
          </Button>
        </Stack>
      );
    }

    if (estado.itens.length === 0) {
      // A precedência da janela vale nas duas telas que têm o botão de mandar,
      // e são só estas duas (`gtm.md` §5.1).
      if (estadoDoEnvio !== "aberto") {
        return <EnvioIndisponivel estado={estadoDoEnvio} abertura={abertura} />;
      }
      return (
        <EstadoVazio
          titulo="Aqui ficam as suas fotos"
          corpo="Você ainda não mandou nenhuma. Quando mandar, elas aparecem nesta tela e só você vê."
        />
      );
    }

    return (
      <Stack sx={{ gap: 2 }}>
        <GradeMidias>
          {estado.itens.map(item => (
            <CardMidia
              key={item.id}
              miniatura={item.miniatura}
              // AS DUAS PERGUNTAS, nos dois cantos. `visibilidade` está em 100%
              // dos cards — inclusive nos que ainda sobem.
              visibilidade={item.visibilidade}
              chegada={item.chegada}
              aoAbrir={() => setEmFoco(item)}
            />
          ))}
        </GradeMidias>
        <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "center" }}>
          {estado.total === 1 ? "Você mandou 1 foto." : `Você mandou ${estado.total} fotos.`}
        </Typography>

        {/**
         * O CTA DO LOOP (H-16) E O LINK GUARDADO (H-22) — **abaixo da grade**, e
         * só depois de ao menos uma mídia armazenada.
         *
         * `temMidiaArmazenada` é o que traduz a regra do `escopo-core.md` §11.4
         * em dado: `chegando` significa que nem a prévia confirmou, e nesse
         * estado o envio ainda não concluiu. O rodapé se desenha sozinho a
         * partir daí — a decisão mora no componente, junto com o motivo.
         */}
        <Divider />
        <RodapeDoLoop
          eventoId={eventoId}
          nomeCasal={nomeCasal}
          temMidiaArmazenada={estado.itens.some(item => item.chegada !== "chegando")}
          aoAvisar={setRecado}
        />
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
          {/**
           * O TÍTULO É LITERAL E FIXO (§17.6, RN-31): "As minhas fotos", nunca
           * "as fotos do Tio Carlos". Nome de convidado é PII de **terceiro**, e
           * ele nem escolheu estar ali — não entra no cabeçalho, na aba do
           * navegador nem em metadado nenhum. E como o título não contém dado do
           * usuário, ele tem comprimento fixo e o teste de estresse de 40/60
           * caracteres não se aplica a ele.
           */}
          <Typography id={idDaGrade} variant="h3" component="h1">
            As minhas fotos
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Só você vê esta tela.
          </Typography>
        </Stack>

        <ResumoDoTopo
          estadoDaFila={estadoDaFila}
          originaisPendentes={estado.originaisPendentes}
        />

        <Box
          component="section"
          role="region"
          aria-labelledby={idDaGrade}
          aria-busy={estado.carregando}
          sx={{ mt: 2 }}
        >
          {conteudo}
        </Box>
      </Box>

      <BarraDeEnvio
        estadoDaFila={estadoDaFila}
        // O slot da fila já mora no topo desta tela: repetir o indicador aqui
        // embaixo seriam duas mensagens sobre o mesmo estado, e a de baixo nunca
        // é lida.
        comIndicador={false}
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
        aoEscolherArquivos={
          podeEnviar
            ? arquivos => {
                const fotos = arquivos.filter(arquivo => !ehVideo(arquivo.type));
                setVideosRecusados(arquivos.length - fotos.length);
                setEscolhidos(fotos);
                setFolhaDeEnvio(true);
              }
            : null
        }
        extra={
          <Box sx={{ pt: 1, textAlign: "center" }}>
            <Typography
              component={Link}
              href={`/e/${slug}/album`}
              variant="body2"
              sx={{ color: "primary.dark" }}
            >
              Ver as fotos da festa
            </Typography>
          </Box>
        }
      />

      <SeletorNomeConvidado
        aberta={folhaDoNome}
        aoFechar={() => setFolhaDoNome(false)}
        convidados={convidados}
        inicial={rotuloAtual ?? ""}
        aoConfirmar={resultado => void identificar(resultado)}
        aviso={avisoDoNome}
      />

      <FolhaDeEnvio
        aberta={folhaDeEnvio}
        aoFechar={() => {
          setFolhaDeEnvio(false);
          setEscolhidos([]);
          setVideosRecusados(0);
        }}
        previas={previas}
        videosRecusados={videosRecusados}
        aoEscolher={visibilidade => void mandar(visibilidade)}
      />

      <FolhaDaFoto
        // A `key` é o que faz a folha voltar ao painel de ver ao trocar de foto
        // — ver o comentário em `FolhaDaFoto`. Removê-la daqui quebra lá.
        key={emFoco?.id ?? "nenhuma"}
        midia={emFoco}
        aoFechar={() => setEmFoco(null)}
        aoTrocar={nova => void trocar(nova)}
        aoApagar={() => void apagarFoto(emFoco?.id ?? "")}
        aoBaixar={() => void baixarFoto(emFoco?.id ?? "")}
      />

      {/**
       * APAGAR É **UM TOQUE, SEM CONFIRMAÇÃO EM DOIS PASSOS** (H-10). Atrito para
       * apagar é atrito na hora errada. A confirmação virou *Desfazer* — e o
       * `Desfazer` de verdade é da F1.7, junto com a rota de restauração; aqui o
       * toast já diz o limite honesto, que é a parte que não pode faltar.
       */}
      <Snackbar
        open={recado !== null}
        autoHideDuration={6000}
        onClose={() => setRecado(null)}
        message={recado ?? ""}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ bottom: { xs: 96 } }}
      />
    </>
  );
}

export default MinhasFotos;
