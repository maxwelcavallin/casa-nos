import {
  assinarUrl,
  baseDoPublico,
  chavesDaMidia,
  configuracaoR2,
  PREFIXO_PUBLICO,
  urlPublicaDeFeed,
  VALIDADE_DA_LEITURA_SEGUNDOS,
  type ConfiguracaoR2,
  type VisibilidadeDaChave,
} from "@/lib/r2";

/**
 * OS OBJETOS — copiar, apagar, conferir, listar, e purgar a borda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE ARQUIVO EXISTE POR CAUSA DE UMA FRASE QUE O PRODUTO IMPRIME NA TELA:
 * **"Só os noivos veem esta foto."**
 *
 * A RN-33 separa o balde em dois prefixos, e a separação é de segurança: `pub/`
 * é servido por um domínio público, `prv/` não é servido por ninguém sem
 * assinatura de 15 minutos. Uma foto que muda de `feed` para `noivos` **muda de
 * prefixo** — e a troca só é confirmada depois de o endereço antigo parar de
 * responder.
 *
 * **"INCLUSIVE NA BORDA, NÃO SÓ NA ORIGEM"**, e essa metade é a que apareceria
 * como bug de cache meses depois: o domínio público do R2 fica atrás da CDN da
 * Cloudflare. Apagar o objeto na origem e conferir só a origem daria verde
 * enquanto a borda continuasse servindo a foto por horas, para quem tivesse o
 * endereço. Por isso o caminho é **apagar → purgar → conferir no endereço
 * público**, e a conferência é a que decide.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TUDO PASSA POR UMA PORTA (`ClienteDeObjetos`), e não por `fetch` espalhado.
 * Não é gosto por abstração: sem a porta, a coreografia acima só seria
 * verificável com um balde de verdade e um domínio de verdade — ou seja, nunca
 * antes da festa. Com ela, `test/visibilidade-move-objetos.test.ts` prova a
 * ORDEM e prova que **a troca falha inteira quando a borda não confirma**, que é
 * a única coisa que o produto promete aqui.
 */

export type Objeto = {
  chave: string;
  tamanho: number | null;
  modificadoEm: Date | null;
};

export type ClienteDeObjetos = {
  /** `HEAD` na chave. `null` quando o objeto não existe. */
  cabeca(chave: string): Promise<Objeto | null>;
  copiar(de: string, para: string): Promise<boolean>;
  apagar(chave: string): Promise<boolean>;
  /** Uma página da listagem do balde, por prefixo. */
  listar(prefixo: string, apos: string | null): Promise<{ objetos: Objeto[]; proximo: string | null }>;
  /** Invalida os endereços na CDN. `false` quando não há como purgar. */
  purgarNaBorda(enderecos: string[]): Promise<boolean>;
  /** `true` se o endereço PÚBLICO ainda devolve conteúdo. É a conferência. */
  respondeNoPublico(endereco: string): Promise<boolean>;
};

/* ------------------------------------------------------------------ *
 * O cliente de verdade
 * ------------------------------------------------------------------ */

async function chamar(
  configuracao: ConfiguracaoR2,
  metodo: "GET" | "HEAD" | "PUT" | "DELETE",
  chave: string,
  cabecalhos: Record<string, string> = {},
  consulta: Record<string, string> = {}
): Promise<Response> {
  const url = await assinarUrl(
    configuracao,
    metodo,
    chave,
    new Date(),
    VALIDADE_DA_LEITURA_SEGUNDOS,
    consulta,
    cabecalhos
  );
  return fetch(url, { method: metodo, headers: cabecalhos });
}

/**
 * O cliente, ou `null` sem R2 configurado.
 *
 * `null` NÃO é falha: sem balde não há objeto, e sem objeto não há endereço
 * público para vazar. É o lado certo de degradar — o produto continua abrindo,
 * a troca de visibilidade continua funcionando, e o que não existe não precisa
 * ser movido. O que **não** pode acontecer é o contrário: R2 configurado e a
 * troca fingindo que moveu.
 */
export function clienteR2(): ClienteDeObjetos | null {
  const configuracao = configuracaoR2();
  if (!configuracao) return null;
  return clienteSobre(configuracao);
}

export function clienteSobre(configuracao: ConfiguracaoR2): ClienteDeObjetos {
  return {
    async cabeca(chave) {
      const resposta = await chamar(configuracao, "HEAD", chave);
      if (!resposta.ok) return null;
      const tamanho = Number(resposta.headers.get("content-length"));
      const modificado = resposta.headers.get("last-modified");
      return {
        chave,
        tamanho: Number.isFinite(tamanho) ? tamanho : null,
        modificadoEm: modificado ? new Date(modificado) : null,
      };
    },

    async copiar(de, para) {
      /**
       * Cópia no servidor: o objeto não passa por aqui. `x-amz-copy-source`
       * precisa vir ASSINADO (a AWS exige todo `x-amz-*` na assinatura) — sem
       * isso o R2 devolve `SignatureDoesNotMatch`, que é um erro que parece de
       * credencial e manda quem investiga trocar a chave secreta.
       */
      const resposta = await chamar(configuracao, "PUT", para, {
        "x-amz-copy-source": `/${configuracao.balde}/${de}`,
      });
      return resposta.ok;
    },

    async apagar(chave) {
      const resposta = await chamar(configuracao, "DELETE", chave);
      // 204 e 404 são os dois "não está mais lá". Tratar 404 como falha faria a
      // segunda passada do cron reprovar o trabalho da primeira.
      return resposta.ok || resposta.status === 404;
    },

    async listar(prefixo, apos) {
      const resposta = await chamar(configuracao, "GET", "", {}, {
        "list-type": "2",
        prefix: prefixo,
        "max-keys": "1000",
        ...(apos ? { "continuation-token": apos } : {}),
      });
      if (!resposta.ok) return { objetos: [], proximo: null };
      const xml = await resposta.text();
      return { objetos: lerListagem(xml), proximo: lerProximo(xml) };
    },

    async purgarNaBorda(enderecos) {
      const zona = process.env.CF_ZONE_ID;
      const token = process.env.CF_API_TOKEN;
      if (!zona || !token || enderecos.length === 0) return false;
      try {
        const resposta = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zona}/purge_cache`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ files: enderecos }),
          }
        );
        return resposta.ok;
      } catch {
        return false;
      }
    },

    async respondeNoPublico(endereco) {
      try {
        /**
         * `cache: "no-store"` e `pragma: no-cache` para o nosso próprio pedido
         * não ser respondido por um cache intermediário. A pergunta é sobre a
         * borda da Cloudflare, e não sobre o cache do runtime que está
         * perguntando.
         */
        const resposta = await fetch(endereco, {
          method: "GET",
          cache: "no-store",
          headers: { "cache-control": "no-cache", pragma: "no-cache" },
        });
        return resposta.ok;
      } catch {
        /**
         * Falha de rede é **"não sei"**, e "não sei" conta como AINDA RESPONDE.
         * O lado seguro de errar aqui é recusar a troca: a alternativa é
         * confirmar para a convidada que só os noivos veem a foto dela porque um
         * `fetch` nosso deu timeout.
         */
        return true;
      }
    },
  };
}

/** `<Key>…</Key>` da listagem v2 do S3. Sem parser de XML: são duas tags. */
function lerListagem(xml: string): Objeto[] {
  const objetos: Objeto[] = [];
  for (const bloco of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const chave = bloco[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
    if (!chave) continue;
    const tamanho = Number(bloco[1].match(/<Size>(\d+)<\/Size>/)?.[1] ?? "");
    const data = bloco[1].match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1];
    objetos.push({
      chave: decodificarXml(chave),
      tamanho: Number.isFinite(tamanho) ? tamanho : null,
      modificadoEm: data ? new Date(data) : null,
    });
  }
  return objetos;
}

function lerProximo(xml: string): string | null {
  if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) return null;
  return xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? null;
}

function decodificarXml(texto: string): string {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/* ------------------------------------------------------------------ *
 * A coreografia da RN-33
 * ------------------------------------------------------------------ */

/** As duas derivadas. O original nunca se move: ele é `prv/` em toda visibilidade. */
const DERIVADAS = ["miniatura", "previa"] as const;

export type MotivoDaFalha = "copia" | "remocao" | "borda";

export type ResultadoDoMovimento =
  | { ok: true; movidas: number; confirmadoNaBorda: boolean }
  | { ok: false; motivo: MotivoDaFalha };

/** Quantas vezes conferir o endereço público antes de desistir. */
const TENTATIVAS_DE_CONFERENCIA = 3;
const ESPERA_ENTRE_CONFERENCIAS_MS = 400;

const dormir = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * `feed` → `noivos`: **restringir**. Copia para `prv/`, apaga de `pub/`, purga a
 * borda e **confere que o endereço público parou de responder**.
 *
 * A ORDEM É A GARANTIA, e ela não é intercambiável:
 *
 *   1. copiar   — se falhar, nada mudou e a foto continua acessível. Abortar
 *                 aqui é seguro.
 *   2. apagar   — se falhar, a cópia em `prv/` é lixo inofensivo e o público
 *                 continua de pé. Abortar.
 *   3. purgar   — melhor esforço; o passo 4 é quem decide.
 *   4. conferir — **é este o critério**. Enquanto o endereço público responder,
 *                 a promessa é falsa, e a troca não pode ser confirmada.
 *
 * Quem chama só escreve `midias.visibilidade` depois de `ok: true`. A H-10 já
 * mandava reverter quando a troca não completa, e o texto de erro dela ("Não
 * conseguimos mudar agora. Continua na festa.") é verdadeiro justamente porque
 * esta função abortou antes do banco.
 */
export async function restringirDerivadas(
  eventoId: string,
  midiaId: string,
  cliente: ClienteDeObjetos | null = clienteR2()
): Promise<ResultadoDoMovimento> {
  // Sem R2 não há objeto, e sem objeto não há endereço público. Nada a mover, e
  // a promessa continua verdadeira por ausência.
  if (!cliente) return { ok: true, movidas: 0, confirmadoNaBorda: true };

  const doPublico = chavesDaMidia(eventoId, midiaId, null, "feed");
  const doPrivado = chavesDaMidia(eventoId, midiaId, null, "noivos");

  let movidas = 0;
  const enderecos: string[] = [];

  for (const faixa of DERIVADAS) {
    const existe = await cliente.cabeca(doPublico[faixa]);
    // O objeto pode não existir ainda: a foto acabou de entrar na fila e a
    // prévia não subiu. Não é erro — é o caso comum de quem troca a
    // visibilidade na tela de "as minhas fotos" antes de a foto chegar.
    if (!existe) continue;
    if (!(await cliente.copiar(doPublico[faixa], doPrivado[faixa]))) {
      return { ok: false, motivo: "copia" };
    }
    if (!(await cliente.apagar(doPublico[faixa]))) {
      return { ok: false, motivo: "remocao" };
    }
    movidas += 1;
    const endereco = urlPublicaDeFeed(eventoId, midiaId, faixa);
    if (endereco) enderecos.push(endereco);
  }

  if (enderecos.length === 0) {
    return { ok: true, movidas, confirmadoNaBorda: true };
  }

  await cliente.purgarNaBorda(enderecos);

  for (let tentativa = 0; tentativa < TENTATIVAS_DE_CONFERENCIA; tentativa++) {
    const vivos = await Promise.all(enderecos.map(e => cliente.respondeNoPublico(e)));
    if (!vivos.some(Boolean)) {
      return { ok: true, movidas, confirmadoNaBorda: true };
    }
    if (tentativa < TENTATIVAS_DE_CONFERENCIA - 1) {
      await dormir(ESPERA_ENTRE_CONFERENCIAS_MS);
    }
  }

  return { ok: false, motivo: "borda" };
}

/**
 * `noivos` → `feed`: **abrir**. Só copia — e a remoção do lado privado é feita
 * DEPOIS de o banco confirmar, por quem chama.
 *
 * A ASSIMETRIA COM A FUNÇÃO DE CIMA É DE PROPÓSITO. Abrindo, o risco muda de
 * lado: se apagássemos `prv/` antes do banco e a escrita falhasse, a foto
 * ficaria `noivos` no banco e sem objeto em `prv/` — a convidada abriria "as
 * minhas fotos" e veria um tile quebrado no lugar da própria foto. Deixar lixo
 * em `prv/` é o erro barato; o cron do H-15 recolhe.
 */
export async function abrirDerivadas(
  eventoId: string,
  midiaId: string,
  cliente: ClienteDeObjetos | null = clienteR2()
): Promise<ResultadoDoMovimento> {
  if (!cliente) return { ok: true, movidas: 0, confirmadoNaBorda: true };

  const doPublico = chavesDaMidia(eventoId, midiaId, null, "feed");
  const doPrivado = chavesDaMidia(eventoId, midiaId, null, "noivos");

  let movidas = 0;
  for (const faixa of DERIVADAS) {
    if (!(await cliente.cabeca(doPrivado[faixa]))) continue;
    if (!(await cliente.copiar(doPrivado[faixa], doPublico[faixa]))) {
      return { ok: false, motivo: "copia" };
    }
    movidas += 1;
  }
  return { ok: true, movidas, confirmadoNaBorda: true };
}

/** Recolhe o lado privado depois de a abertura ter sido confirmada no banco. */
export async function limparRestosPrivados(
  eventoId: string,
  midiaId: string,
  cliente: ClienteDeObjetos | null = clienteR2()
): Promise<void> {
  if (!cliente) return;
  const doPrivado = chavesDaMidia(eventoId, midiaId, null, "noivos");
  for (const faixa of DERIVADAS) await cliente.apagar(doPrivado[faixa]);
}

/* ------------------------------------------------------------------ *
 * A varredura do cron — a guarda contra a falha parcial
 * ------------------------------------------------------------------ */

/** `pub/e/<evento>/m/<midia>/t.jpg` → `<midia>`. `null` quando não é chave de mídia. */
export function midiaDaChave(chave: string): string | null {
  return chave.match(/^(?:pub|prv)\/e\/[^/]+\/m\/([^/]+)\/[tpo]\./)?.[1] ?? null;
}

export function prefixoPublicoDoEvento(eventoId: string): string {
  return `${PREFIXO_PUBLICO}/e/${eventoId}/`;
}

export type VarreduraDoPublico = {
  conferidos: number;
  removidos: number;
  /** Ids de mídia cujo objeto público não deveria existir. É o que vira alerta. */
  indevidos: string[];
};

/**
 * Varre `pub/` de um evento atrás de objeto que **não deveria estar lá**: mídia
 * `noivos` ou mídia excluída.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO É PARTE DA PROMESSA, E NÃO FAXINA. A troca de visibilidade é uma
 * coreografia de quatro passos entre um banco e um balde, sem transação entre os
 * dois. Ela aborta antes do banco quando falha — mas o processo pode morrer no
 * meio (a Vercel encerra a função), e aí sobra uma mídia `noivos` com objeto em
 * `pub/`. **Sem esta varredura, a promessa fica quebrada em silêncio**, que é
 * exatamente o modo de falha que este produto não pode ter.
 *
 * Ela roda no cron diário (H-15) e o resultado vai para `eventos_de_erro` —
 * porque um objeto indevido encontrado aqui significa que uma troca não
 * terminou, e isso é informação, não rotina silenciosa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function varrerPublicoIndevido(
  eventoId: string,
  visibilidadeDe: (midiaIds: string[]) => Promise<Map<string, VisibilidadeDaChave | "excluida">>,
  cliente: ClienteDeObjetos | null = clienteR2()
): Promise<VarreduraDoPublico> {
  const saida: VarreduraDoPublico = { conferidos: 0, removidos: 0, indevidos: [] };
  if (!cliente || !baseDoPublico()) return saida;

  let apos: string | null = null;
  do {
    const pagina: { objetos: Objeto[]; proximo: string | null } = await cliente.listar(
      prefixoPublicoDoEvento(eventoId),
      apos
    );
    apos = pagina.proximo;
    if (pagina.objetos.length === 0) continue;

    const porMidia = new Map<string, string[]>();
    for (const objeto of pagina.objetos) {
      const midiaId = midiaDaChave(objeto.chave);
      if (!midiaId) continue;
      porMidia.set(midiaId, [...(porMidia.get(midiaId) ?? []), objeto.chave]);
    }

    saida.conferidos += porMidia.size;
    const situacao = await visibilidadeDe([...porMidia.keys()]);

    for (const [midiaId, chaves] of porMidia) {
      const estado = situacao.get(midiaId);
      // `undefined` = objeto sem linha no banco. Não pode existir (o `midia_id`
      // nasce da linha), e por isso ele é tratado como indevido em vez de
      // ignorado: se apareceu, alguma coisa escreveu no balde por fora.
      if (estado === "feed") continue;
      saida.indevidos.push(midiaId);
      for (const chave of chaves) {
        if (await cliente.apagar(chave)) saida.removidos += 1;
      }
      const enderecos = DERIVADAS.map(f => urlPublicaDeFeed(eventoId, midiaId, f)).filter(
        (e): e is string => e !== null
      );
      await cliente.purgarNaBorda(enderecos);
    }
  } while (apos);

  return saida;
}
