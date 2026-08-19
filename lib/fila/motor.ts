import type { EventosDeAnalytics, NomeDeEvento } from "@/lib/analytics";
import type { Armazem } from "@/lib/fila/armazem";
import {
  concorrencia,
  ehVideo,
  esperaEmMs,
  idadeEmSegundos,
  precisaDaFaixa,
  proximosDaFaixa,
  resumoDaFila,
  terminou,
  urlsValidas,
} from "@/lib/fila/maquina";
import type { Rede } from "@/lib/fila/rede";
import { itemNovo, type FaixaLocal, type ItemDaFila, type TipoDeFalha } from "@/lib/fila/tipos";
import type { OrigemDaFoto, Visibilidade } from "@/lib/midias";

/**
 * O MOTOR DA FILA — a aposta inteira do produto, num arquivo.
 *
 * O que ele promete ao convidado: escolher as fotos e **voltar para a festa**.
 * O que ele promete a quem mantém: nada aqui depende de o aparelho estar online
 * no instante da escolha, nem de a aba continuar aberta, nem de a rede ser boa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ORDEM QUE NÃO PODE MUDAR, e que é o motivo de a H-06 vir antes da H-07:
 *
 *   1. arquivo copiado para o IndexedDB      (antes de qualquer rede)
 *   2. INTENÇÃO registrada no servidor       (antes de qualquer byte de imagem)
 *   3. PUT das faixas no R2                  (os bytes)
 *   4. confirmação por faixa                 (o carimbo que conta)
 *
 * Entre 1 e 2 o aparelho pode ficar offline por dias: o item está no disco e a
 * intenção sai quando houver rede. Entre 2 e 3 o navegador pode morrer: a linha
 * de intenção FICA no banco, e é exatamente ela que a reconciliação procura
 * (H-15) — a foto aparece como perdida, que é a verdade, em vez de não existir
 * para ninguém. É a diferença entre "nenhuma mídia perdida" ser uma consulta e
 * ser uma esperança.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TUDO É INJETADO — armazém, rede, relógio e medidor. É o que permite ao
 * `test/fila-motor.test.ts` reproduzir o wifi do salão no CI: modo avião
 * intermitente, portal cativo respondendo HTML com status 200, 500 do servidor,
 * URL expirada depois de uma noite. Nada disso é reproduzível com `fetch` de
 * verdade, e é justamente isso que decide se o produto funciona.
 */

export type ContextoDaFila = {
  eventoId: string;
  participacaoId: string;
  /** O uuid do evento, que é o `wedding_id` do GA4. Nunca o slug. */
  weddingId: string;
  faixaLenta: boolean;
  /**
   * Epoch em ms da primeira abertura deste aparelho (o "scan"). Vira
   * `seconds_since_scan`, e só na faixa `previa` — no `original` ele mediria o
   * uplink do salão, não o produto.
   */
  primeiroAcessoEm: number | null;
};

export type Medidor = <N extends NomeDeEvento>(
  nome: N,
  parametros: EventosDeAnalytics[N]
) => void;

export type Escolha = {
  arquivo: Blob;
  nome: string;
  tipoArquivo: string;
  bytes: number;
};

export type ResultadoDaEscolha = {
  enfileirados: number;
  /** Vídeos recusados NO APARELHO (RN-12). As fotos do mesmo lote seguem. */
  videosRecusados: number;
  /** Fotos que o navegador não decodificou: o original sobe, a prévia é do cron. */
  semPreviaLocal: number;
};

export type EstadoDaFila = {
  pendentes: number;
  maisVelhoEmSegundos: number;
  /** O que o indicador de envio está mostrando agora. */
  situacao: "parada" | "enviando" | "sem_rede" | "portal_cativo" | "retomando" | "concluido";
  /** Itens encontrados na retomada — a barra alta do "achamos 6 fotos". */
  retomados: number;
};

export type Ferramentas = {
  armazem: Armazem;
  rede: Rede;
  agora: () => number;
  medir: Medidor;
  /** Gera as derivadas. Injetado porque canvas não existe no ambiente de teste. */
  gerarDerivadas: (arquivo: Blob) => Promise<{
    miniatura: Blob;
    previa: Blob;
    largura: number;
    altura: number;
  } | null>;
  hashDoArquivo: (arquivo: Blob) => Promise<string>;
  novoId: () => string;
  online: () => boolean;
  aoMudar?: (estado: EstadoDaFila) => void;
};

/**
 * A TRAVA DE DRENAGEM, POR EVENTO E POR ABA — e ela nasceu na F1.3.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ATÉ A F1.2 EXISTIA UMA TELA SÓ, e a trava local de cada motor bastava. A F1.3
 * acrescenta a segunda: tocar num dos dois botões de envio leva a "as minhas
 * fotos" (H-08), e a navegação **monta um segundo motor sobre o mesmo
 * IndexedDB** enquanto a drenagem disparada na tela anterior ainda está
 * correndo. Dois motores, dois `PUT` do mesmo arquivo, o mesmo uplink de salão
 * pagando duas vezes — no aparelho que já está com dificuldade.
 *
 * Nada se perde sem ela (a confirmação é idempotente e a chave no R2 é a mesma),
 * mas o que se gasta é justamente o recurso escasso da noite. A trava é de
 * módulo porque o escopo do problema é o módulo: uma aba, um evento, um motor
 * drenando por vez.
 *
 * ELA NÃO ATRAVESSA ABAS. Duas abas do mesmo álbum continuam podendo drenar em
 * paralelo — para isso seria preciso um cadeado no próprio IndexedDB, e o custo
 * disso não se justifica por um caso que quase não acontece e que já é seguro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const DRENANDO = new Set<string>();

export function criarMotor(ferramentas: Ferramentas, contexto: ContextoDaFila) {
  const { armazem, rede, agora, medir } = ferramentas;
  let faixaLenta = contexto.faixaLenta;
  let situacao: EstadoDaFila["situacao"] = "parada";
  let retomados = 0;

  async function itensVivos(): Promise<ItemDaFila[]> {
    const todos = await armazem.listar(contexto.eventoId);
    return todos.filter(item => !terminou(item));
  }

  async function anunciar(): Promise<EstadoDaFila> {
    const vivos = await itensVivos();
    const resumo = resumoDaFila(vivos, agora());
    if (resumo.pendentes === 0 && situacao === "enviando") situacao = "concluido";
    const estado: EstadoDaFila = { ...resumo, situacao, retomados };
    ferramentas.aoMudar?.(estado);
    return estado;
  }

  /* ---------------------------------------------------------------- *
   * 1. A escolha — antes de qualquer rede
   * ---------------------------------------------------------------- */

  /**
   * Copia os arquivos para o IndexedDB **antes de tocar na rede**.
   *
   * É o passo que faz "cortar a rede antes de tocar em enviar e reabrir a
   * página recupera os arquivos" ser verdade. A alternativa comum — segurar o
   * `File` em memória e subir direto — perde tudo quando a aba fecha, e no iOS a
   * aba fecha sozinha quando o convidado volta para a festa. Que é exatamente o
   * comportamento que o produto pede que ele tenha.
   */
  async function enfileirar(
    escolhas: Escolha[],
    opcoes: { visibilidade: Visibilidade; origem: OrigemDaFoto }
  ): Promise<ResultadoDaEscolha> {
    const loteId = ferramentas.novoId();
    const enfileiradaOffline = !ferramentas.online();
    let enfileirados = 0;
    let videosRecusados = 0;
    let semPreviaLocal = 0;

    for (const escolha of escolhas) {
      if (ehVideo(escolha.tipoArquivo)) {
        videosRecusados += 1;
        continue;
      }

      const clientMediaId = ferramentas.novoId();
      const hashConteudo = await ferramentas.hashDoArquivo(escolha.arquivo);
      const derivadas = await ferramentas.gerarDerivadas(escolha.arquivo);
      if (!derivadas) semPreviaLocal += 1;

      const item = itemNovo(
        {
          clientMediaId,
          eventoId: contexto.eventoId,
          participacaoId: contexto.participacaoId,
          loteId,
          visibilidade: opcoes.visibilidade,
          origem: opcoes.origem,
          tipoArquivo: escolha.tipoArquivo,
          bytes: escolha.bytes,
          hashConteudo,
          nomeLocal: escolha.nome,
          enfileiradaOffline,
        },
        agora(),
        derivadas !== null
      );

      // O ORIGINAL É GUARDADO SEMPRE. Ele é o arquivo do casal, e é o único que
      // não dá para regenerar: se o convidado apagar a foto da galeria depois de
      // escolher — que a H-07 exige que funcione —, esta cópia é a única que
      // existe.
      await armazem.gravarBlob(clientMediaId, "original", escolha.arquivo);
      if (derivadas) {
        await armazem.gravarBlob(clientMediaId, "miniatura", derivadas.miniatura);
        await armazem.gravarBlob(clientMediaId, "previa", derivadas.previa);
      }
      await armazem.salvar(item);
      enfileirados += 1;
    }

    if (enfileirados > 0) {
      // Melhor esforço, e NUNCA denominador (metricas.md §13.4): se o aparelho
      // estiver sem rede agora — o caso que este produto existe para atender —,
      // este evento se perde e não volta.
      medir("media_upload_started", {
        wedding_id: contexto.weddingId,
        media_count: enfileirados,
        media_visibility: opcoes.visibilidade,
        enqueued_offline: enfileiradaOffline ? "true" : "false",
      });
      situacao = "enviando";
    }

    await anunciar();
    return { enfileirados, videosRecusados, semPreviaLocal };
  }

  /* ---------------------------------------------------------------- *
   * 2. A intenção — antes dos bytes
   * ---------------------------------------------------------------- */

  async function registrarIntencoes(itens: ItemDaFila[]): Promise<void> {
    const pendentes = itens.filter(item => !urlsValidas(item, agora()));
    if (pendentes.length === 0) return;

    // Um POST por lote (decisão P3): a exigência de medição custa ZERO ida à
    // rede a mais, porque a mesma requisição que grava a intenção devolve as
    // URLs assinadas de todas as faixas de todos os arquivos.
    const porLote = new Map<string, ItemDaFila[]>();
    for (const item of pendentes) {
      const lista = porLote.get(item.loteId) ?? [];
      lista.push(item);
      porLote.set(item.loteId, lista);
    }

    for (const [loteId, doLote] of porLote) {
      const resposta = await rede.intencao(contexto.eventoId, {
        lote_id: loteId,
        itens: doLote.map(item => ({
          client_media_id: item.clientMediaId,
          lote_id: item.loteId,
          bytes: item.bytes,
          tipo_arquivo: item.tipoArquivo,
          hash_conteudo: item.hashConteudo,
          visibilidade: item.visibilidade,
          origem: item.origem,
          enfileirada_offline: item.enfileiradaOffline,
        })),
      });

      if (resposta.situacao === "fora_da_janela" || resposta.situacao === "sem_permissao") {
        // ESTADO, NÃO FALHA. A tela diz o que aconteceu e a fila para de tentar:
        // insistir não muda nada, e um indicador dizendo "mandando" a noite
        // inteira sobre algo que o servidor recusou é uma mentira do produto.
        situacao = "parada";
        return;
      }

      if (resposta.situacao === "tipo_nao_suportado") {
        for (const item of doLote) await descartar(item);
        continue;
      }

      if (resposta.situacao !== "ok" || !resposta.itens) {
        for (const item of doLote) await adiar(item, resposta.falha ?? "rede");
        continue;
      }

      if (resposta.faixaLenta) faixaLenta = true;

      const porCliente = new Map(resposta.itens.map(i => [i.client_media_id, i]));
      for (const item of doLote) {
        const devolvido = porCliente.get(item.clientMediaId);
        if (!devolvido) continue;
        item.midiaId = devolvido.midia_id;
        item.urls = devolvido.urls;
        item.urlsExpiramEm = Date.parse(devolvido.expira_em);
        item.ultimaFalha = null;
        await armazem.salvar(item);
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * 3 e 4. Os bytes, e o carimbo
   * ---------------------------------------------------------------- */

  async function enviarFaixaDoItem(
    item: ItemDaFila,
    faixa: "previa" | "original"
  ): Promise<void> {
    if (!item.midiaId || !item.urls) return;

    // A faixa `previa` carrega DOIS objetos (decisão P5) e é confirmada como um
    // item só: miniatura de 400 e prévia de 1600. A grade do feed baixa a
    // miniatura; a prévia só ao abrir a foto.
    const objetos: FaixaLocal[] =
      faixa === "previa" ? ["miniatura", "previa"] : ["original"];

    for (const objeto of objetos) {
      if (item.faixas[objeto] !== "pendente") continue;
      const url = item.urls[objeto];
      const dados = await armazem.lerBlob(item.clientMediaId, objeto);
      if (!url || !dados) {
        await adiar(item, "arquivo");
        return;
      }

      const tipo = objeto === "original" ? item.tipoArquivo : "image/jpeg";
      const resultado = await rede.enviarFaixa(url, dados, tipo);
      if (!resultado.sucesso) {
        await adiar(item, resultado.falha ?? "rede");
        return;
      }
    }

    const confirmacao = await rede.confirmar(contexto.eventoId, item.midiaId, { faixa });
    if (!confirmacao.sucesso) {
      await adiar(item, confirmacao.falha ?? "rede");
      return;
    }

    // O BLOB DE UMA FAIXA SOME ASSIM QUE ELA CONFIRMA. Num celular com pouco
    // espaço, segurar 30 originais até o fim da noite é o que faz o sistema
    // limpar o IndexedDB inteiro — e aí a fila some junto.
    for (const objeto of objetos) {
      item.faixas[objeto] = "confirmada";
      await armazem.apagarBlob(item.clientMediaId, objeto);
    }
    const tentativasAteAqui = item.tentativas;
    item.ultimaFalha = null;
    item.tentativas = 0;

    // UMA VEZ POR FAIXA (RN-28). A marca é gravada ANTES de o evento sair e
    // sobrevive ao fechamento da aba: uma confirmação repetida do servidor não
    // pode virar um segundo evento, ou a participação infla por retentativa.
    const jaDisparado = item.eventoDisparado[faixa] === true;
    if (!jaDisparado) item.eventoDisparado[faixa] = true;
    await armazem.salvar(item);

    if (!jaDisparado) {
      medir("media_upload_succeeded", {
        wedding_id: contexto.weddingId,
        upload_lane: faixa,
        media_visibility: item.visibilidade,
        media_source: item.origem,
        enqueued_offline: item.enfileiradaOffline ? "true" : "false",
        queue_age_seconds: idadeEmSegundos(item, agora()),
        attempt_count: tentativasAteAqui,
        visibility_changed: "false",
        ...(faixa === "previa" && contexto.primeiroAcessoEm
          ? {
              seconds_since_scan: Math.max(
                0,
                Math.round((agora() - contexto.primeiroAcessoEm) / 1000)
              ),
            }
          : {}),
      });
    }

    if (terminou(item)) await armazem.remover(item.clientMediaId);
  }

  async function adiar(item: ItemDaFila, falha: TipoDeFalha): Promise<void> {
    item.tentativas += 1;
    item.ultimaFalha = falha;
    // NENHUM LIMITE DE TENTATIVAS enquanto o item existir (H-07). O recuo tem
    // teto de 60 s: a rede do salão volta em minutos, e um recuo exponencial sem
    // teto deixaria o item dormindo depois de ela ter voltado.
    item.proximaTentativaEm = agora() + esperaEmMs(item.tentativas);
    await armazem.salvar(item);

    situacao =
      falha === "portal" ? "portal_cativo" : falha === "rede" ? "sem_rede" : "enviando";

    medir("media_upload_retried", {
      wedding_id: contexto.weddingId,
      attempt_count: item.tentativas,
      // `portal` não existe no dicionário do GA4 (metricas.md §6): são três
      // valores, e inventar um quarto criaria dimensão fora do dicionário. O
      // portal cativo é, do ponto de vista da medição, rede — e a distinção que
      // importa (ela tem ação na tela) vive no produto, não no relatório.
      error_kind:
        falha === "servidor" ? "servidor" : falha === "arquivo" ? "arquivo" : "rede",
    });

    if (falha !== "rede" && item.midiaId) {
      await rede.relatarErro({
        evento_id: contexto.eventoId,
        midia_id: item.midiaId,
        tipo_erro: falha === "servidor" ? "servidor" : "arquivo",
        mensagem: `falha na faixa apos ${item.tentativas} tentativas`,
      });
    }
  }

  /** Vídeo que passou pela recusa do aparelho e foi recusado pela rota (422). */
  async function descartar(item: ItemDaFila): Promise<void> {
    for (const faixa of ["miniatura", "previa", "original"] as FaixaLocal[]) {
      await armazem.apagarBlob(item.clientMediaId, faixa);
    }
    await armazem.remover(item.clientMediaId);
  }

  /* ---------------------------------------------------------------- *
   * O ciclo
   * ---------------------------------------------------------------- */

  /**
   * Uma passada da fila. Chamável quantas vezes for: ela é protegida por uma
   * trava simples, porque `visibilitychange`, `online` e o temporizador
   * disparam juntos quando a rede volta — e três drenagens simultâneas subiriam
   * o mesmo arquivo três vezes.
   */
  async function drenar(): Promise<EstadoDaFila> {
    // A trava é por EVENTO e vale para todos os motores desta aba — ver o
    // comentário de `DRENANDO`. Ela substitui a trava local que existia aqui: um
    // booleano por motor não vê o motor que a outra tela acabou de criar.
    if (DRENANDO.has(contexto.eventoId)) return anunciar();
    DRENANDO.add(contexto.eventoId);
    try {
      const vivos = await itensVivos();
      if (vivos.length === 0) return anunciar();

      situacao = "enviando";
      await registrarIntencoes(vivos);

      const limites = concorrencia(faixaLenta);
      const atualizados = await itensVivos();

      // PRÉVIA PRIMEIRO, SEMPRE. É a faixa que conta (RN-14): sem ela a foto não
      // existe no álbum, no telão nem na métrica. O original é qualidade, e pode
      // levar dias.
      const daPrevia = proximosDaFaixa(atualizados, "previa", agora(), limites.previa);
      await Promise.all(daPrevia.map(item => enviarFaixaDoItem(item, "previa")));

      // O original só anda quando não há prévia esperando: uma foto de 40 MB não
      // pode segurar a prévia de 300 KB de mais ninguém.
      const restantes = await itensVivos();
      const aindaTemPrevia = restantes.some(item => precisaDaFaixa(item, "previa"));
      if (!aindaTemPrevia) {
        const doOriginal = proximosDaFaixa(restantes, "original", agora(), limites.original);
        await Promise.all(doOriginal.map(item => enviarFaixaDoItem(item, "original")));
      }

      return anunciar();
    } finally {
      DRENANDO.delete(contexto.eventoId);
    }
  }

  /**
   * A retomada, ao abrir a página.
   *
   * SOZINHA, SEM PERGUNTAR (H-07). Perguntar "deseja retomar?" transfere ao
   * convidado uma decisão que ele não tem como avaliar, no meio de uma festa, e
   * a resposta certa é sempre sim. O que ele recebe é o aviso do que está
   * acontecendo — "achamos 6 fotos que faltavam" —, não uma pergunta.
   */
  async function retomar(): Promise<EstadoDaFila> {
    const vivos = await itensVivos();
    retomados = vivos.length;
    if (retomados > 0) situacao = "retomando";
    // O recuo é zerado: o item pode ter adormecido com 60 s de espera e a aba
    // ficou fechada por horas. Esperar de novo seria contar o tempo duas vezes.
    for (const item of vivos) {
      if (item.proximaTentativaEm > agora()) {
        item.proximaTentativaEm = agora();
        await armazem.salvar(item);
      }
    }
    await anunciar();
    return drenar();
  }

  /**
   * O convidado saiu com a fila cheia.
   *
   * SUBESTIMA SEMPRE, e está escrito para ninguém tratar como censo: sai por
   * `sendBeacon`, e o aparelho sem rede — de novo, o caso que importa — não
   * manda nada. O número oficial de perda é SQL (RN-14).
   */
  async function aoSair(): Promise<void> {
    const vivos = await itensVivos();
    if (vivos.length === 0) return;
    const resumo = resumoDaFila(vivos, agora());
    medir("media_upload_abandoned", {
      wedding_id: contexto.weddingId,
      pending_count: resumo.pendentes,
      oldest_pending_seconds: resumo.maisVelhoEmSegundos,
    });
  }

  return { enfileirar, drenar, retomar, aoSair, estado: anunciar };
}

export type Motor = ReturnType<typeof criarMotor>;
