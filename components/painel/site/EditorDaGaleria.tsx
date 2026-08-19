"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ArrowDown, ArrowUp, ImagePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { EstadoVazio } from "@/components/EstadoVazio";
import { gerarDerivadas } from "@/lib/fila/derivadas";
import {
  conferirArquivo,
  conferirLadoMenor,
  MAXIMO_DE_FOTOS,
  RECUSA_DE_FORMATO_EXOTICO,
  TETO_DA_LEGENDA,
} from "@/lib/galeria";
import { grade, largura, raio, toque } from "@/lib/tokens";
import { useAvisoDeSaida, type SituacaoDeSaida } from "@/lib/usar-aviso-de-saida";

/**
 * O EDITOR DA GALERIA (v1.0, V-18 e V-19) — o envio, e o que vem depois dele.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O CAMINHO INTEIRO DE UMA FOTO, e por que ele é assim:
 *
 *   1. `conferirArquivo`     25 MB e formato, **antes de decodificar**
 *   2. `gerarDerivadas`      duas derivadas NO NAVEGADOR — os 12 MB do iPhone
 *                            nunca cruzam a rede
 *   3. `conferirLadoMenor`   sobre as medidas do arquivo escolhido, não da prévia
 *   4. `POST .../galeria`    a intenção: a LINHA nasce, e volta com duas URLs.
 *                            **É aqui que o teto de 12 responde 409** (RV-24)
 *   5. dois `PUT` no R2      direto do navegador para o balde
 *   6. `POST .../confirmacao` o carimbo. Antes dele a foto não existe para o site
 *
 * **A PARTE DIFÍCIL É O PASSO 5 FALHAR PELA METADE**, e é o custo real desta
 * história: a miniatura sobe e a prévia não. O álbum resolve essa mesma falha
 * com a fila inteira — motor, armazém em IndexedDB, recuo exponencial sem limite
 * de tentativas, de-duplicação por hash. **Aquela máquina existe para 200
 * convidados num uplink de salão saturado durante seis horas**, e não para uma
 * pessoa com o painel aberto em casa. Usá-la aqui seria construir o caro para
 * resolver o barato.
 *
 * O que a galeria tem no lugar são duas coisas, e elas bastam **porque o
 * original está no celular do casal**:
 *
 *   a. **Nada é carimbado até os dois `PUT` terem terminado.** Um envio que
 *      morre no meio deixa a linha como intenção — e linha sem `armazenada_em`
 *      não renderiza no site e não conta (RV-25). O site nunca mostra meia foto.
 *
 *   b. **Tentar de novo reusa a MESMA linha.** O `foto_id` e as duas URLs ficam
 *      guardados no estado desta tela; a retentativa pula a intenção e refaz os
 *      `PUT` (as URLs valem 24 h). **Nenhuma linha nova é criada**, e é por isso
 *      que insistir cinco vezes não produz cinco fotos fantasmas.
 *
 * **E SE A PESSOA FECHAR A ABA NO MEIO:** a linha de intenção fica no banco,
 * invisível em todo lugar, e a foto simplesmente não foi. Ela manda de novo, e
 * essa é a operação inteira. Não há cron de limpeza, e a 0015 escreve por quê —
 * é lixo na tabela, não no balde, e com teto de doze por evento isso não é
 * problema. Escrever a ausência é mais barato que construir o faxineiro.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O QUE A V-19 ACRESCENTA — legenda, ordem e exclusão —, com as duas decisões de
 * comportamento que não são óbvias:
 *
 * **1. A ORDEM NÃO TRAVA A TELA ENQUANTO SALVA, e aqui esta tela diverge do
 * `PainelDoSite` de propósito.** Lá os botões de subir/descer ficam
 * desabilitados durante o salvamento, e está certo: são sete seções, quase
 * sempre um movimento por vez. Aqui são **doze fotos**, e levar a última ao topo
 * são **onze toques seguidos** — com o botão desabilitado a cada um, isso é onze
 * esperas de rede em cima de uma pessoa que só queria arrumar a ordem. Então a
 * lista move na hora, sempre, e os pedidos são **enfileirados e fundidos**:
 * enquanto um está no ar, o próximo toque só atualiza o que será mandado depois.
 * Como o `PATCH` leva a **lista inteira** (RV-05), o último pedido descreve o
 * estado final sozinho — dois toques rápidos custam no máximo dois pedidos, e
 * podem custar um só.
 *
 * **2. APAGAR PEDE UMA CONFIRMAÇÃO, E UMA SÓ.** Não são dois passos, não se
 * digita nada, não há segunda caixa. O que a caixa faz é **dizer o que
 * acontece**: esta é a única exclusão do produto que apaga byte, e o arquivo sai
 * do ar de verdade — inclusive para quem tinha o endereço dele guardado. É
 * exatamente a saída que a confirmação de tirar o site do ar aponta (RV-21), e
 * uma pessoa que chega aqui vindo de lá precisa reconhecer a promessa.
 */

/** A foto que já está no site. Vem do servidor, montada na página. */
export type FotoNoEditor = {
  id: string;
  /** A MINIATURA de 400 (D7). A prévia de 1600 é do site. `null` sem R2. */
  urlMiniatura: string | null;
  legenda: string | null;
  ordem: number;
  /** `false` = medidas incoerentes: a foto está guardada e **não aparece**. */
  apareceNoSite: boolean;
};

export type DadosDaGaleria = {
  eventoId: string;
  fotos: FotoNoEditor[];
  /**
   * `false` quando `R2_PUBLIC_BASE` ou as credenciais do balde não estão
   * configuradas. A tela diz que o envio está indisponível **antes** de a pessoa
   * escolher um arquivo — deixá-la escolher a foto para receber 503 depois é
   * gastar o tempo dela para dar a mesma resposta.
   */
  envioDisponivel: boolean;
};

type Passo = "preparando" | "enviando" | "confirmando" | "parou";

type Envio = {
  /** Id local. Não é o `foto_id`: ele só existe depois da intenção. */
  chave: string;
  nome: string;
  arquivo: File;
  /** O endereço local da prévia, para a pessoa ver o que escolheu. */
  previaLocal: string;
  /** Existe depois da intenção. **É o que faz tentar de novo reusar a linha.** */
  fotoId: string | null;
  urls: { miniatura: string; previa: string } | null;
  medidas: { largura: number; altura: number; bytesPrevia: number } | null;
  derivadas: { miniatura: Blob; previa: Blob } | null;
  passo: Passo;
  /** O motivo, específico. Nunca "erro". */
  motivo: string | null;
};

const ROTULO_DO_PASSO: Record<Passo, string> = {
  preparando: "Preparando a foto…",
  enviando: "Enviando…",
  confirmando: "Quase lá…",
  parou: "Não terminou",
};

export function EditorDaGaleria({ dados }: { dados: DadosDaGaleria }) {
  const [fotos, setFotos] = useState<FotoNoEditor[]>(dados.fotos);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [aApagar, setAApagar] = useState<FotoNoEditor | null>(null);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);
  /**
   * AS DUAS COISAS QUE ESTA TELA PODE PERDER AO SAIR (V-15), e elas não são o
   * mesmo tipo de perda que nos editores de texto.
   *
   * `legendasPendentes` — legenda digitada e ainda não salva. Aqui a foto **já
   * está publicada**: sair não deixa "nada aconteceu" para trás, deixa uma foto
   * no site com a legenda errada ou faltando. É esta a perda que promoveu a
   * V-15 de Should para Must.
   *
   * `ordemNoAr` — um `PATCH` de ordem em curso ou pendente na fila. A ordem
   * salva sozinha, então o intervalo é curto; mas dentro dele o que está na tela
   * ainda não é o que o site mostra, e sair perde exatamente o toque que a
   * pessoa acabou de dar.
   */
  const [legendasPendentes, setLegendasPendentes] = useState<Record<string, boolean>>({});
  const [ordemNoAr, setOrdemNoAr] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  /**
   * O ESTADO DA FILA DA ORDEM — em `ref`, e não em `useState`, de propósito.
   *
   * Estes três valores são lidos e escritos **dentro do laço assíncrono**, e um
   * `useState` ali devolveria o valor da renderização em que o laço começou:
   * dois toques rápidos leriam os dois "não estou salvando" e disparariam dois
   * pedidos concorrentes, que é justamente o que a fila existe para impedir.
   * Nada aqui é desenhado na tela, então nada aqui precisa causar renderização.
   */
  const ordemConfirmada = useRef<FotoNoEditor[]>(dados.fotos);
  const salvandoOrdem = useRef(false);
  const ordemPendente = useRef<FotoNoEditor[] | null>(null);

  /**
   * A ORDEM CONFIRMADA ACOMPANHA A LISTA — **menos enquanto um `PATCH` de ordem
   * está no ar**, que é quando o laço da fila é o dono dela.
   *
   * Sem isto, apagar uma foto e depois falhar ao reordenar devolveria a tela a
   * uma lista que ainda continha a foto apagada. Uma foto que "volta" depois de
   * apagada é a pior reversão possível: ela é exatamente o resultado que a
   * pessoa acabou de pedir para não existir.
   */
  useEffect(() => {
    if (!salvandoOrdem.current && !ordemPendente.current) ordemConfirmada.current = fotos;
  }, [fotos]);

  const noTeto = fotos.length >= MAXIMO_DE_FOTOS;

  /**
   * **ENVIO EM CURSO NÃO É "ALTERAÇÃO NÃO SALVA", E A PRECEDÊNCIA É ESTA.** A
   * foto a caminho já tem linha no banco, sem `armazenada_em`: ela não renderiza
   * e não conta em lugar nenhum. Quem sair no meio não perde o que digitou —
   * perde a foto, e a saída é mandá-la de novo, não procurar um botão de salvar.
   * Por isso `enviando` vem antes de `alterado` quando os dois valem.
   */
  const situacao: SituacaoDeSaida = envios.some(e => e.passo !== "parou")
    ? "enviando"
    : Object.values(legendasPendentes).some(Boolean) || ordemNoAr
      ? "alterado"
      : "limpo";

  useAvisoDeSaida(situacao);

  /**
   * **ESTÁVEL DE PROPÓSITO**, e não por otimização: ela entra na lista de
   * dependências do efeito que publica o rascunho, lá dentro de cada linha. Uma
   * função nova a cada renderização faria aquele efeito limpar e repor o mesmo
   * sinal em laço — que aqui não é lentidão, é laço infinito de renderização.
   */
  const registrarRascunho = useCallback((fotoId: string, pendente: boolean) => {
    setLegendasPendentes(atual =>
      atual[fotoId] === pendente ? atual : { ...atual, [fotoId]: pendente }
    );
  }, []);

  function atualizar(chave: string, mudanca: Partial<Envio>) {
    setEnvios(atual => atual.map(e => (e.chave === chave ? { ...e, ...mudanca } : e)));
  }

  function parar(chave: string, motivo: string) {
    atualizar(chave, { passo: "parou", motivo });
  }

  /**
   * A foto acabou de ser carimbada: ela sai da lista de envios e entra na lista
   * gerenciada, **sem recarregar a página**.
   *
   * A miniatura usada é o endereço LOCAL do arquivo escolhido, e não a do balde.
   * É a mesma imagem, já decodificada neste aparelho, e não custa um byte de
   * rede — enquanto a do balde custaria uma volta pela borda que acabou de
   * receber o objeto. No próximo carregamento a do balde entra sozinha.
   */
  function promoverAFoto(envio: Envio, fotoId: string) {
    setFotos(atual => [
      ...atual,
      {
        id: fotoId,
        urlMiniatura: envio.previaLocal,
        legenda: null,
        ordem: atual.length + 1,
        apareceNoSite: true,
      },
    ]);
    setEnvios(atual => atual.filter(e => e.chave !== envio.chave));
  }

  /**
   * O laço de um envio. Recebe o estado atual porque ele muda entre passos, e
   * ler do `useState` aqui dentro pegaria a versão de antes da intenção — a
   * retentativa perderia o `foto_id` e criaria uma linha nova a cada toque.
   */
  async function levar(envio: Envio) {
    const { chave } = envio;

    // ─── 1 e 2: preparar, no navegador ───
    let medidas = envio.medidas;
    let derivadas = envio.derivadas;

    if (!derivadas || !medidas) {
      atualizar(chave, { passo: "preparando", motivo: null });

      const recusaDoArquivo = conferirArquivo(envio.arquivo);
      if (recusaDoArquivo) return parar(chave, recusaDoArquivo.mensagem);

      const geradas = await gerarDerivadas(envio.arquivo);
      // `null` NÃO É FALHA DO PRODUTO: é um formato que o navegador não abre.
      // Sem original no balde, não há servidor para resgatar — então a resposta
      // é a verdade, na hora, com o caminho de saída.
      if (!geradas) return parar(chave, RECUSA_DE_FORMATO_EXOTICO);

      const recusaDeTamanho = conferirLadoMenor(
        geradas.larguraOriginal,
        geradas.alturaOriginal
      );
      if (recusaDeTamanho) return parar(chave, recusaDeTamanho.mensagem);

      medidas = {
        largura: geradas.largura,
        altura: geradas.altura,
        bytesPrevia: geradas.previa.size,
      };
      derivadas = { miniatura: geradas.miniatura, previa: geradas.previa };
      atualizar(chave, { medidas, derivadas });
    }

    // ─── 3: a intenção, só se ainda não houver linha ───
    let fotoId = envio.fotoId;
    let urls = envio.urls;

    if (!fotoId || !urls) {
      atualizar(chave, { passo: "enviando" });
      try {
        const resposta = await fetch(`/api/eventos/${dados.eventoId}/site/galeria`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            largura: medidas.largura,
            altura: medidas.altura,
            bytes_previa: medidas.bytesPrevia,
          }),
        });

        if (resposta.status === 503) {
          return parar(
            chave,
            "O envio de fotos está indisponível agora. Nenhuma foto foi perdida: " +
              "tente de novo daqui a pouco, ou avise quem cuida do site."
          );
        }

        /**
         * **O TETO, COM OS DOIS NÚMEROS** (RV-24). Eles vêm do servidor, e não
         * da constante daqui: se um dia o teto mudar, a frase muda junto sem
         * ninguém lembrar desta tela. A constante só entra como rede de
         * segurança, para a frase nunca sair sem número.
         */
        if (resposta.status === 409) {
          const corpo = (await resposta.json().catch(() => null)) as {
            detalhe?: { teto?: number; quantas?: number };
          } | null;
          const teto = corpo?.detalhe?.teto ?? MAXIMO_DE_FOTOS;
          const quantas = corpo?.detalhe?.quantas ?? teto;
          return parar(
            chave,
            `Vocês já têm ${quantas} fotos no site, e cabem ${teto}. ` +
              "Apague uma para pôr esta no lugar."
          );
        }

        if (!resposta.ok) {
          return parar(
            chave,
            "Não conseguimos começar o envio agora. Nada foi para o site — toque em tentar de novo."
          );
        }
        const corpo = (await resposta.json()) as {
          foto_id: string;
          urls: { miniatura: string; previa: string };
        };
        fotoId = corpo.foto_id;
        urls = corpo.urls;
        atualizar(chave, { fotoId, urls });
      } catch {
        return parar(
          chave,
          "A internet caiu antes de o envio começar. Nada foi para o site — toque em tentar de novo."
        );
      }
    }

    // ─── 4: os dois PUT, direto no balde ───
    atualizar(chave, { passo: "enviando", motivo: null });
    try {
      const subir = (url: string, corpo: Blob) =>
        fetch(url, { method: "PUT", body: corpo }).then(r => {
          if (!r.ok) throw new Error(String(r.status));
        });

      /**
       * **EM SEQUÊNCIA, E NÃO EM PARALELO.** Duas requisições simultâneas no 4G
       * do celular disputam o mesmo uplink e as duas ficam lentas; e, mais
       * importante, o `Promise.all` esconde qual das duas falhou. Aqui, se a
       * prévia parar, a miniatura já subiu — e a retentativa reenvia as duas,
       * que é o certo: `PUT` sobrescreve, e reenviar um objeto idêntico não
       * custa nada além do byte.
       */
      await subir(urls.miniatura, derivadas.miniatura);
      await subir(urls.previa, derivadas.previa);
    } catch {
      return parar(
        chave,
        "A foto parou no meio do caminho. Ela ainda não está no site — toque em tentar de novo."
      );
    }

    // ─── 5: o carimbo. É ele que faz a foto existir para o site. ───
    atualizar(chave, { passo: "confirmando" });
    try {
      const resposta = await fetch(
        `/api/eventos/${dados.eventoId}/site/galeria/${fotoId}/confirmacao`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            largura: medidas.largura,
            altura: medidas.altura,
            bytes_previa: medidas.bytesPrevia,
          }),
        }
      );
      if (!resposta.ok) throw new Error(String(resposta.status));
    } catch {
      /**
       * **O SEGUNDO `POST` FALHOU, E ESTE É O ESTADO QUE O `po` ISOLOU.**
       *
       * Os dois arquivos estão no balde e o banco ainda diz "intenção". O texto
       * não pode dizer "a foto foi": ela não aparece no site. E não pode dizer
       * "a foto se perdeu": ela está lá, e tentar de novo termina o trabalho sem
       * subir nada de novo que importe.
       */
      return parar(
        chave,
        "A foto subiu, mas não conseguimos confirmar. Ela ainda não aparece no site — " +
          "toque em tentar de novo, que a gente termina daqui."
      );
    }

    promoverAFoto(envio, fotoId);
  }

  function escolher(lista: FileList | null) {
    if (!lista || lista.length === 0) return;

    const novos: Envio[] = [...lista].map((arquivo, i) => ({
      chave: `${Date.now()}-${i}-${arquivo.name}`,
      nome: arquivo.name,
      arquivo,
      previaLocal: URL.createObjectURL(arquivo),
      fotoId: null,
      urls: null,
      medidas: null,
      derivadas: null,
      passo: "preparando" as const,
      motivo: null,
    }));

    setEnvios(atual => [...atual, ...novos]);
    // Um de cada vez, na ordem em que a pessoa escolheu: a ordem no site é a
    // ordem de chegada, e disparar tudo junto embaralharia as duas.
    void novos.reduce(
      (antes, envio) => antes.then(() => levar(envio)),
      Promise.resolve()
    );

    // O `<input type="file">` guarda o último valor. Sem isto, escolher a MESMA
    // foto duas vezes seguidas não dispara nada — e a pessoa acha que travou.
    if (entrada.current) entrada.current.value = "";
  }

  function tentarDeNovo(chave: string) {
    const envio = envios.find(e => e.chave === chave);
    if (!envio) return;
    void levar(envio);
  }

  /* ---------------------------------------------------------------- *
   * A legenda
   * ---------------------------------------------------------------- */

  async function salvarLegenda(fotoId: string, texto: string): Promise<boolean> {
    setErroDaLista(null);
    try {
      const resposta = await fetch(
        `/api/eventos/${dados.eventoId}/site/galeria/${fotoId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          // Campo vazio viaja como `null` e não como `""`: limpar a legenda é
          // uma edição legítima, e o servidor trata as duas como a mesma coisa.
          body: JSON.stringify({ legenda: texto.trim() === "" ? null : texto }),
        }
      );
      if (!resposta.ok) throw new Error(String(resposta.status));

      const corpo = (await resposta.json()) as { legenda: string | null };
      // Repinta com o que o SERVIDOR gravou, e não com o que foi digitado: é
      // ele quem normaliza o espaço em branco, e a pessoa precisa ver a frase
      // que o site vai mostrar.
      setFotos(atual =>
        atual.map(f => (f.id === fotoId ? { ...f, legenda: corpo.legenda } : f))
      );
      return true;
    } catch {
      setErroDaLista(
        "Não conseguimos salvar a legenda agora. O que você escreveu continua aqui, " +
          "e o site continua com a legenda de antes."
      );
      return false;
    }
  }

  /* ---------------------------------------------------------------- *
   * A ordem — a lista move na hora, e os pedidos se fundem
   * ---------------------------------------------------------------- */

  function mover(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    if (destino < 0 || destino >= fotos.length) return;

    const trocadas = [...fotos];
    [trocadas[indice], trocadas[destino]] = [trocadas[destino], trocadas[indice]];

    /**
     * A ordem é REESCRITA de 1 a N, e não trocada entre as duas linhas.
     *
     * Trocar os números funcionaria enquanto eles fossem distintos. Uma galeria
     * que nunca foi reordenada tem os números de chegada, e um envio que morreu
     * no meio pode ter deixado empates. Reescrever a sequência inteira torna a
     * ordem do casal independente do que havia antes.
     */
    const proximas = trocadas.map((f, i) => ({ ...f, ordem: i + 1 }));
    setFotos(proximas);
    void enfileirarOrdem(proximas);
  }

  /**
   * A FILA DE UM LUGAR SÓ.
   *
   * Enquanto um `PATCH` está no ar, o toque seguinte **não dispara outro**: ele
   * substitui o que está pendente. Quando o pedido em curso volta, o laço manda
   * o pendente — que já é o estado final da tela, porque o corpo é a lista
   * inteira (RV-05). Dois toques rápidos no celular custam **um ou dois**
   * pedidos, nunca dois pedidos concorrentes que cheguem fora de ordem e gravem
   * o penúltimo estado por último.
   */
  async function enfileirarOrdem(lista: FotoNoEditor[]) {
    ordemPendente.current = lista;
    // O espelho em estado existe só para o aviso de saída (V-15): os `ref`
    // acima não causam renderização, e um aviso que depende deles nunca
    // apareceria.
    setOrdemNoAr(true);
    if (salvandoOrdem.current) return;
    salvandoOrdem.current = true;

    try {
      while (ordemPendente.current) {
        const aMandar = ordemPendente.current;
        ordemPendente.current = null;

        const resposta = await fetch(`/api/eventos/${dados.eventoId}/site/galeria`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fotos: aMandar.map(f => ({ id: f.id, ordem: f.ordem })),
          }),
        });
        if (!resposta.ok) throw new Error(String(resposta.status));
        ordemConfirmada.current = aMandar;
      }
      setErroDaLista(null);
    } catch {
      /**
       * A tela volta à ÚLTIMA ORDEM QUE O SERVIDOR CONFIRMOU, e não à de um
       * toque atrás: com toques fundidos, "o estado anterior" não existe como
       * um só. E a mensagem diz **em que estado o site ficou**, que é a regra
       * das mensagens de falha deste produto.
       */
      setFotos(ordemConfirmada.current);
      ordemPendente.current = null;
      setErroDaLista(
        "Não conseguimos salvar a ordem agora. A ordem no site continua a de antes."
      );
    } finally {
      salvandoOrdem.current = false;
      setOrdemNoAr(false);
    }
  }

  /* ---------------------------------------------------------------- *
   * A exclusão — a única do produto que apaga byte
   * ---------------------------------------------------------------- */

  async function apagar(foto: FotoNoEditor) {
    setAApagar(null);
    setErroDaLista(null);
    try {
      const resposta = await fetch(
        `/api/eventos/${dados.eventoId}/site/galeria/${foto.id}`,
        { method: "DELETE" }
      );

      /**
       * **502 = O BALDE RECUSOU, E NADA FOI APAGADO** (RV-22). É o único caso em
       * que dá para afirmar as duas metades com certeza, e a frase afirma as
       * duas: a foto continua no site, e o arquivo continua respondendo. Quem
       * chegou aqui pela confirmação de tirar o site do ar precisa saber que a
       * saída que ela prometeu **não** aconteceu.
       */
      if (resposta.status === 502) {
        setErroDaLista(
          "Não conseguimos apagar o arquivo agora. A foto continua no site, e nada " +
            "foi apagado pela metade. Tente de novo daqui a pouco."
        );
        return;
      }

      // 404 é "já não estava lá" — outra aba apagou, ou a passada anterior
      // terminou o trabalho. Some da lista, sem mensagem: não há nada a
      // consertar, e um alerta aqui seria erro inventado.
      if (!resposta.ok && resposta.status !== 404) throw new Error(String(resposta.status));

      setFotos(atual => atual.filter(f => f.id !== foto.id));
    } catch {
      /**
       * A JANELA DE FALHA NO MEIO, dita como ela é. Entre o arquivo sair do
       * balde e a linha ser marcada, o processo pode morrer — e nesse instante o
       * arquivo já não existe e a foto ainda está na lista. Não dá para saber,
       * daqui, de que lado a falha ficou; o que dá para dizer é **o que resolve
       * os dois casos**, que é apertar apagar de novo (apagar o que já não
       * existe atravessa o balde sem fazer nada).
       */
      setErroDaLista(
        "Não conseguimos terminar de apagar agora. Toque em apagar de novo — " +
          "a gente termina daqui."
      );
    }
  }

  const nada = fotos.length === 0 && envios.length === 0;

  return (
    <Stack sx={{ gap: 2 }}>
      {!dados.envioDisponivel ? (
        <Alert severity="warning">
          O envio de fotos está indisponível neste momento. O resto do site
          continua funcionando normalmente, e nada do que já está no ar mudou.
        </Alert>
      ) : null}

      {erroDaLista ? (
        <Alert severity="error" onClose={() => setErroDaLista(null)}>
          {erroDaLista}
        </Alert>
      ) : null}

      {nada ? (
        <EstadoVazio
          titulo="Nenhuma foto ainda"
          corpo="Enquanto estiver vazia, a seção não aparece no site. Escolha uma foto de vocês — ela aparece grande, uma embaixo da outra."
          acao={
            <Button
              variant="contained"
              startIcon={<ImagePlus size={18} />}
              onClick={() => entrada.current?.click()}
              disabled={!dados.envioDisponivel}
              sx={{ minHeight: toque.confortavel }}
            >
              Escolher a primeira foto
            </Button>
          }
        />
      ) : null}

      {!nada ? (
        <Card>
          <Stack divider={<Divider />}>
            {fotos.map((item, indice) => (
              <FotoGerenciada
                key={item.id}
                foto={item}
                posicao={indice + 1}
                primeira={indice === 0}
                ultima={indice === fotos.length - 1}
                aoMover={direcao => mover(indice, direcao)}
                aoSalvarLegenda={texto => salvarLegenda(item.id, texto)}
                aoMudarRascunho={registrarRascunho}
                aoApagar={() => setAApagar(item)}
              />
            ))}

            {envios.map(envio => (
              <LinhaDeEnvio
                key={envio.chave}
                url={envio.previaLocal}
                titulo={envio.nome}
                estado={ROTULO_DO_PASSO[envio.passo]}
                trabalhando={envio.passo !== "parou"}
                aviso={envio.motivo}
                acao={
                  envio.passo === "parou" ? (
                    <Button
                      onClick={() => tentarDeNovo(envio.chave)}
                      sx={{ minHeight: toque.minimo }}
                    >
                      Tentar de novo
                    </Button>
                  ) : null
                }
              />
            ))}
          </Stack>
        </Card>
      ) : null}

      {/**
       * `hidden` no atributo, e não `display: none` no `sx`: o campo continua
       * acessível pelo botão, que é quem tem rótulo e alvo de 48 px. Um
       * `<input type="file">` cru é um dos controles mais difíceis de acertar no
       * celular, e ele não precisa aparecer para funcionar.
       */}
      <Box
        component="input"
        type="file"
        ref={entrada}
        hidden
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => escolher(e.target.files)}
      />

      {!nada ? (
        <Stack sx={{ gap: 0.5, alignItems: "flex-start" }}>
          <Button
            variant="contained"
            startIcon={<ImagePlus size={18} />}
            onClick={() => entrada.current?.click()}
            disabled={!dados.envioDisponivel || noTeto}
            sx={{ minHeight: toque.confortavel }}
          >
            Escolher outra foto
          </Button>
          {/* A razão escrita ao lado do botão apagado. Um botão desabilitado sem
              motivo é um defeito, do ponto de vista de quem olha. */}
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {noTeto
              ? `Vocês chegaram a ${MAXIMO_DE_FOTOS} fotos. Apague uma para pôr outra.`
              : fotos.length === 1
                ? `Uma foto no site. Cabem ${MAXIMO_DE_FOTOS}.`
                : `${fotos.length} fotos no site. Cabem ${MAXIMO_DE_FOTOS}.`}
          </Typography>
        </Stack>
      ) : null}

      <Dialog
        open={aApagar !== null}
        onClose={() => setAApagar(null)}
        slotProps={{ paper: { sx: { maxWidth: largura.dialogo } } }}
      >
        <DialogTitle>Apagar esta foto?</DialogTitle>
        <DialogContent>
          {/**
           * **É A ÚNICA EXCLUSÃO DESTA VERSÃO QUE APAGA ARQUIVO**, e a caixa diz
           * isso em vez de perguntar se a pessoa tem certeza. Ela também é a
           * saída que a confirmação de tirar o site do ar aponta (RV-21): quem
           * chega aqui vindo de lá precisa reconhecer a mesma promessa, com as
           * mesmas palavras — o endereço da foto para de responder.
           */}
          <DialogContentText>
            O arquivo sai do ar de verdade e não volta: o endereço dele para de
            responder, inclusive para quem já tinha guardado o link da foto. Se
            esta for a única, a seção inteira deixa de aparecer no site.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAApagar(null)} sx={{ minHeight: toque.minimo }}>
            Deixar como está
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => aApagar && void apagar(aApagar)}
            sx={{ minHeight: toque.minimo }}
          >
            Apagar a foto
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * Uma foto que já está no site
 * ------------------------------------------------------------------ */

/**
 * **A MINIATURA AQUI PODE SER RECORTADA EM 1:1**, e isso não contradiz a regra
 * do site: lá a foto renderizada é a única que existe e o recorte é permanente
 * (§20.3); aqui ela é um reconhecedor de 72 px ao lado dos controles, e a foto de
 * verdade está a um toque no site. É a mesma régua do `CardMidia`:
 * `object-fit: cover` só onde a foto abre em outra superfície.
 *
 * **A LEGENDA SALVA POR BOTÃO, E NÃO AO SAIR DO CAMPO** (RV-11). Não há
 * salvamento automático em lugar nenhum deste painel, e o motivo vale aqui
 * inteiro: no celular, à noite, em conexão ruim, salvar sozinho produz gravações
 * parciais que ninguém pediu. O botão **só aparece quando o texto mudou** — uma
 * fileira de doze botões "salvar" acesos sobre doze legendas já salvas é ruído
 * que ensina a ignorar o botão.
 */
function FotoGerenciada({
  foto,
  posicao,
  primeira,
  ultima,
  aoMover,
  aoSalvarLegenda,
  aoMudarRascunho,
  aoApagar,
}: {
  foto: FotoNoEditor;
  posicao: number;
  primeira: boolean;
  ultima: boolean;
  aoMover: (direcao: -1 | 1) => void;
  aoSalvarLegenda: (texto: string) => Promise<boolean>;
  /** Avisa o pai que esta legenda tem texto por salvar (V-15). */
  aoMudarRascunho: (fotoId: string, pendente: boolean) => void;
  aoApagar: () => void;
}) {
  const [texto, setTexto] = useState(foto.legenda ?? "");
  const [salvando, setSalvando] = useState(false);
  const [salvou, setSalvou] = useState(false);

  const gravada = foto.legenda ?? "";
  const mudou = texto.trim() !== gravada;

  /**
   * O rascunho sobe para o pai porque o guarda da saída é um só para a tela
   * inteira — doze linhas com doze guardas seriam doze diálogos possíveis, e o
   * décimo terceiro nasceria sem.
   */
  useEffect(() => {
    aoMudarRascunho(foto.id, mudou);
    return () => aoMudarRascunho(foto.id, false);
  }, [foto.id, mudou, aoMudarRascunho]);

  async function salvar() {
    setSalvando(true);
    try {
      const ok = await aoSalvarLegenda(texto);
      setSalvou(ok);
    } finally {
      // O desligamento no `finally`, e nenhum `return` de guarda antes dele
      // (`stack.md` §6): um caminho de saída que não desligue deixaria o botão
      // travado para sempre, sem erro e sem nada no console.
      setSalvando(false);
    }
  }

  return (
    <Stack direction="row" sx={{ gap: 1.5, px: 2, py: 2, alignItems: "flex-start" }}>
      <Box
        sx={{
          width: grade.tileMinimo,
          height: grade.tileMinimo,
          flex: "none",
          borderRadius: `${raio.input}px`,
          bgcolor: "action.selected",
          overflow: "hidden",
        }}
      >
        {foto.urlMiniatura ? (
          <Box
            component="img"
            src={foto.urlMiniatura}
            alt=""
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : null}
      </Box>

      <Stack sx={{ gap: 1, flex: 1, minWidth: 0 }}>
        <TextField
          label="Legenda"
          value={texto}
          onChange={e => {
            setTexto(e.target.value);
            setSalvou(false);
          }}
          helperText={
            salvou && !mudou
              ? "Legenda salva."
              : "Opcional. Sem legenda, a foto aparece sozinha."
          }
          slotProps={{ htmlInput: { maxLength: TETO_DA_LEGENDA } }}
          size="small"
          fullWidth
        />

        {!foto.apareceNoSite ? (
          <Typography variant="body2" sx={{ color: "warning.dark", overflowWrap: "anywhere" }}>
            As medidas desta foto não batem, e por isso o site não consegue
            reservar o espaço dela. Mande a foto de novo.
          </Typography>
        ) : null}

        <Stack direction="row" sx={{ gap: 0.5, alignItems: "center", flexWrap: "wrap" }}>
          {/**
           * **SUBIR/DESCER, E NÃO ARRASTAR-E-SOLTAR** (prd-v1 §2.2). Arrastar em
           * lista, no celular, com leitor de tela, é o padrão de acessibilidade
           * mais caro que existe. Cada botão tem `aria-label` que diz **qual**
           * foto ele move — e a foto é nomeada pela posição, porque legenda é
           * opcional e doze rótulos iguais não distinguem nada.
           */}
          <IconButton
            aria-label={`Subir a foto ${posicao}`}
            onClick={() => aoMover(-1)}
            disabled={primeira}
            sx={{ minWidth: toque.minimo, minHeight: toque.minimo }}
          >
            <ArrowUp size={18} aria-hidden />
          </IconButton>
          <IconButton
            aria-label={`Descer a foto ${posicao}`}
            onClick={() => aoMover(1)}
            disabled={ultima}
            sx={{ minWidth: toque.minimo, minHeight: toque.minimo }}
          >
            <ArrowDown size={18} aria-hidden />
          </IconButton>

          <Box sx={{ flex: 1 }} />

          {mudou ? (
            <Button
              variant="contained"
              onClick={() => void salvar()}
              disabled={salvando}
              sx={{ minHeight: toque.minimo }}
            >
              {salvando ? "Salvando…" : "Salvar legenda"}
            </Button>
          ) : null}

          <Button
            color="error"
            onClick={aoApagar}
            sx={{ minHeight: toque.minimo }}
          >
            Apagar
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * Uma foto que ainda está a caminho
 * ------------------------------------------------------------------ */

function LinhaDeEnvio({
  url,
  titulo,
  estado,
  aviso,
  acao,
  trabalhando = false,
}: {
  url: string | null;
  titulo: string;
  estado: string;
  aviso?: string | null;
  acao?: React.ReactNode;
  trabalhando?: boolean;
}) {
  return (
    <Stack
      direction="row"
      sx={{ gap: 1.5, px: 2, py: 2, alignItems: "flex-start" }}
    >
      <Box
        sx={{
          width: grade.tileMinimo,
          height: grade.tileMinimo,
          flex: "none",
          borderRadius: `${raio.input}px`,
          bgcolor: "action.selected",
          overflow: "hidden",
        }}
      >
        {url ? (
          <Box
            component="img"
            src={url}
            alt=""
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : null}
      </Box>

      <Stack sx={{ gap: 0.5, flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>
          {titulo}
        </Typography>
        <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
          {trabalhando ? <CircularProgress size={14} aria-hidden /> : null}
          {/* O estado tem RÓTULO ESCRITO, e não só um ícone girando: cor e
              movimento não são o único sinal (régua §10). */}
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {estado}
          </Typography>
        </Stack>
        {aviso ? (
          <Typography variant="body2" sx={{ color: "warning.dark", overflowWrap: "anywhere" }}>
            {aviso}
          </Typography>
        ) : null}
        {acao}
      </Stack>
    </Stack>
  );
}

export default EditorDaGaleria;
