import { sql, type Executor } from "@/lib/db";
import { ehUuid } from "@/lib/ids";
import { urlPublicaDaFoto } from "@/lib/r2";
import { paraInteiro, paraTexto, paraTextoObrigatorio } from "@/lib/serializar-linha";
import { foto as tokenDaFoto } from "@/lib/tokens";

/**
 * A GALERIA DO CASAL (v1.0, V-18 e V-19) — as réguas, e o acesso a `evento_fotos`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * É A PRIMEIRA VEZ QUE ESTE PRODUTO ESCREVE NO R2 A PARTIR DO PAINEL. Tudo que
 * existia antes era leitura (`urlPublicaDeFeed`) ou construído-e-desligado. O
 * laço *intenção → dois `PUT` do navegador → confirmação* é uma máquina de
 * estados com falha parcial, e o álbum resolveu essa mesma falha com a fila
 * inteira — motor, armazém em IndexedDB, recuo exponencial, de-duplicação.
 *
 * **A GALERIA NÃO USA A FILA, E A AUSÊNCIA É A DECISÃO** (prd-v1 §4.8.3). Aquela
 * máquina existe porque 200 convidados enviam por um uplink de salão saturado
 * durante seis horas e não podem ser convidados a tentar de novo. A noiva
 * mandando oito fotos de casa, à noite, com o painel aberto, é **um envio de
 * formulário**. O que a galeria tem no lugar: um botão de tentar de novo, que
 * reusa a MESMA linha, e uma linha que **não conta e não renderiza** enquanto
 * `armazenada_em` for nulo (RV-25).
 *
 * O QUE ELA REAPROVEITA: `gerarDerivadas` (`lib/fila/derivadas.ts`), que é
 * função pura de navegador e não faz parte do desligamento do álbum. É ela que
 * faz a foto de 12 MB do iPhone **nunca cruzar a rede**: o navegador decodifica,
 * redimensiona, e sobem dois JPEG.
 *
 * O QUE A V-19 ACRESCENTA, e a ordem em que importa: o **teto de 12 conferido no
 * servidor** (RV-24, a porta que V-18 deixou aberta por escrito), a legenda de 80
 * (RV-09), a ordem em UMA instrução (RV-05) e a exclusão que **apaga o objeto no
 * R2 antes de marcar a linha** (RV-22). A exclusão é a única do produto que apaga
 * byte, e é ela que torna verdadeira a frase nova da confirmação de tirar o site
 * do ar: tirar o site do ar não tira o arquivo do ar; apagar a foto tira.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ------------------------------------------------------------------ *
 * As réguas
 * ------------------------------------------------------------------ */

/**
 * Doze. Acima disso a galeria **deixa de ser galeria e vira o álbum** — que é
 * exatamente o que esta versão desligou.
 *
 * **VALIDADO NO SERVIDOR DESDE A V-19** (RV-24), na rota de intenção, com 409 e
 * os dois números no corpo. V-18 tinha deixado a porta aberta de propósito e
 * escrita como ausência; ela fecha aqui.
 *
 * **A CONFERÊNCIA É NA INTENÇÃO, E NÃO NA CONFIRMAÇÃO**, e a escolha tem preço
 * dos dois lados. Recusar na confirmação seria recusar DEPOIS de os dois `PUT`
 * terem terminado: os objetos já estariam no balde, sem linha que os aponte —
 * e não há cron de limpeza (a 0015 escreve a ausência com todas as letras).
 * Recusando na intenção, nada sobe, e a pessoa recebe a resposta antes de gastar
 * o 4G dela. O preço é o registrado em §12.1: duas abas mandando a 12ª e a 13ª
 * ao mesmo tempo cabem as duas. Raio de dano de uma foto a mais, assumido.
 *
 * **A CONTAGEM É DE FOTOS ARMAZENADAS** (RV-25): uma intenção que nunca
 * confirmou não conta. Ela é uma linha sobre bytes que não existem.
 */
export const MAXIMO_DE_FOTOS = 12;

/**
 * 80 caracteres de legenda, validados **no servidor** (RV-09) com o `CHECK` da
 * 0015 como segunda tranca. O teto do campo na tela é conveniência, não
 * segurança — um `PATCH` montado à mão passa por cima dele.
 */
export const TETO_DA_LEGENDA = 80;

/**
 * 25 MB, recusado **antes de decodificar**.
 *
 * Não é segurança — nada do arquivo de entrada chega ao balde. É para um ProRAW
 * de 60 MB não travar a thread principal do celular por vinte segundos sem
 * explicação nenhuma na tela.
 */
export const TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024;

/**
 * O lado menor da FOTO, não o da derivada (ver `Derivadas.larguraOriginal`).
 *
 * Uma foto de 200 px puxada do WhatsApp, esticada numa coluna de 640, parece
 * defeito do produto — e o casal culpa o produto, não a foto.
 */
export const LADO_MENOR_MINIMO = 800;

/** O lado da prévia. Nenhuma derivada excede isto, e é por isso que ele é teto. */
export const LADO_DA_PREVIA = tokenDaFoto.previa;

/**
 * A razão máxima aceita, nos dois sentidos: de 1:6 a 6:1.
 *
 * Não é gosto: é o que separa "uma panorâmica" de "um par de medidas que não
 * bate com o arquivo". Uma foto 1:8 numa coluna de 592 renderiza uma faixa de
 * 74 px de altura, e a explicação muito mais provável para esse par é que ele
 * está errado.
 */
export const RAZAO_MAXIMA = 6;

/**
 * A lista fechada que `extensaoDe()` já conhece.
 *
 * **A SAÍDA É SEMPRE JPEG**, porque é o que o `canvas` produz: nenhum formato
 * sobrevive à passagem, logo nenhuma pergunta de formato chega ao balde. Esta
 * lista existe para recusar cedo, com o motivo, em vez de deixar
 * `createImageBitmap` falhar e a pessoa ler a mensagem de formato exótico.
 */
export const TIPOS_ACEITOS: readonly string[] = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
];

/**
 * A mensagem do HEIC que o navegador não abre (prd-v1 §4.8.3).
 *
 * **Nunca a palavra "erro", nunca "falhou".** O álbum, nesse caso, guarda o
 * original e manda o servidor gerar a prévia depois. A galeria não tem original
 * no balde para o servidor trabalhar, então ela responde a verdade, na hora, e
 * com a saída na mão da pessoa. É o preço honesto de dispensar o original.
 */
export const RECUSA_DE_FORMATO_EXOTICO =
  "O seu iPhone mandou a foto num formato que o navegador não abre. " +
  "Em Ajustes › Câmera › Formatos, escolha “Mais compatível” e tire de novo — " +
  "ou mande esta mesma foto por outro caminho (WhatsApp para você mesma serve) " +
  "e envie o arquivo que chegar.";

export type Recusa = { campo: string; mensagem: string };

/* ------------------------------------------------------------------ *
 * As conferências — puras, e por isso testáveis sem banco e sem navegador
 * ------------------------------------------------------------------ */

/**
 * O que se sabe do arquivo **antes de decodificar**: tamanho e tipo.
 *
 * Recebe a forma mínima de um `File` de propósito. Assim o teste não precisa de
 * `File`, que não existe em Node antigo — e a função não fica presa ao DOM.
 */
export function conferirArquivo(arquivo: { size: number; type: string }): Recusa | null {
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    const mb = Math.round(arquivo.size / (1024 * 1024));
    // O NÚMERO NO CORPO, e não "arquivo grande demais": quem tentou mandar
    // precisa saber quanto é grande demais para escolher outra foto.
    return {
      campo: "arquivo",
      mensagem: `Esta foto tem ${mb} MB, e o limite é ${Math.round(
        TAMANHO_MAXIMO_BYTES / (1024 * 1024)
      )} MB. Escolha outra, ou mande a versão que o celular compartilha.`,
    };
  }

  if (!TIPOS_ACEITOS.includes(arquivo.type.toLowerCase())) {
    return {
      campo: "arquivo",
      mensagem:
        "Este arquivo não é uma foto que o site consiga mostrar. " +
        "Valem JPEG, PNG, WEBP, AVIF e as fotos do iPhone (HEIC).",
    };
  }

  return null;
}

/** O lado menor da foto escolhida, medido no bitmap antes do redimensionamento. */
export function conferirLadoMenor(largura: number, altura: number): Recusa | null {
  const menor = Math.min(largura, altura);
  if (menor >= LADO_MENOR_MINIMO) return null;
  return {
    campo: "arquivo",
    mensagem: `Esta foto tem ${menor} px no lado menor, e o site precisa de pelo menos ${LADO_MENOR_MINIMO} px. ` +
      "Uma foto pequena esticada na coluna do site fica borrada. Mande o arquivo original, e não o que veio do WhatsApp.",
  };
}

/**
 * AS CINCO RECUSAS NOMEADAS DA RV-26 — a validação que `not null` não é.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `largura` e `altura` são `not null` na 0015 para a página **reservar a caixa
 * antes de a imagem carregar**. E `not null` não impede `0`, não impede um par
 * trocado (retrato gravado como paisagem) e não impede um par que não bate com o
 * arquivo. Qualquer um dos três reserva a caixa **errada** — que é exatamente o
 * refluxo que as duas colunas existem para evitar, com o agravante de só
 * aparecer na foto de um casal específico.
 *
 * As cinco, na ordem em que são conferidas:
 *   1. ausente
 *   2. não inteiro
 *   3. `<= 0`
 *   4. acima de 1600 — nenhuma derivada excede o lado da prévia
 *   5. razão fora de 1:6 a 6:1
 *
 * **E a outra metade da regra é do site** (`design-system.md` §20.8.3): foto sem
 * medidas coerentes **não renderiza**. Uma caixa não reservada é pior que uma
 * foto a menos. Ver `medidasCoerentes` e `fotosParaOSite`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function conferirMedidas(largura: unknown, altura: unknown): Recusa[] {
  const recusas: Recusa[] = [];

  for (const [campo, bruto] of [
    ["largura", largura],
    ["altura", altura],
  ] as const) {
    if (bruto === undefined || bruto === null) {
      recusas.push({ campo, mensagem: `A ${campo} da foto não veio.` });
      continue;
    }
    if (typeof bruto !== "number" || !Number.isFinite(bruto) || !Number.isInteger(bruto)) {
      recusas.push({ campo, mensagem: `A ${campo} da foto precisa ser um número inteiro de pixels.` });
      continue;
    }
    if (bruto <= 0) {
      recusas.push({ campo, mensagem: `A ${campo} da foto precisa ser maior que zero.` });
      continue;
    }
    if (bruto > LADO_DA_PREVIA) {
      recusas.push({
        campo,
        mensagem: `A ${campo} da foto veio como ${bruto} px, e nenhuma prévia passa de ${LADO_DA_PREVIA} px.`,
      });
    }
  }

  // A razão só é conferível com os dois lados válidos. Conferi-la antes daria
  // duas mensagens sobre o mesmo defeito, e a segunda confundiria.
  if (recusas.length === 0) {
    const l = largura as number;
    const a = altura as number;
    const razao = Math.max(l / a, a / l);
    if (razao > RAZAO_MAXIMA) {
      recusas.push({
        campo: "largura",
        mensagem:
          `Estas medidas descrevem uma foto ${l}×${a}, quase ${Math.round(razao)} vezes mais ` +
          "comprida que alta. O site não consegue reservar o espaço dela.",
      });
    }
  }

  return recusas;
}

/**
 * A metade do `lead-design`: **foto sem medidas coerentes não renderiza**.
 *
 * É o mesmo predicado de `conferirMedidas`, aplicado na LEITURA. Ele existe
 * separado porque protege de um caso que a validação de escrita não alcança:
 * uma linha gravada antes de a regra existir, ou por um caminho que ninguém
 * previu. A caixa errada é pior que a foto a menos.
 */
export function medidasCoerentes(largura: number, altura: number): boolean {
  return conferirMedidas(largura, altura).length === 0;
}

/**
 * A LEGENDA — texto puro, 80 caracteres, **conferida no servidor** (RV-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `null` E `""` SÃO A MESMA COISA, E VIRAM `null`. Uma legenda vazia não é uma
 * legenda curta: ela **não desenha `<figcaption>` nenhum** na página, e gravar
 * `""` produziria uma linha que o `CHECK` aceita e que o site renderizaria como
 * uma caixa vazia sob a foto — exatamente o item 8 da lista de proibições
 * (`design-system.md` §20.6). Uma coisa, um valor.
 *
 * **O ESPAÇO EM BRANCO É NORMALIZADO ANTES DE MEDIR**, e não é frescura:
 *
 *   * a legenda mora num `<figcaption>` de uma a três linhas, e **HTML colapsa
 *     quebra de linha em espaço**. Um Enter digitado no campo não faria nada na
 *     tela e ainda ocuparia um dos 80 caracteres — o casal contaria 80 e o site
 *     mostraria 79, sem explicação em lugar nenhum;
 *   * colar do WhatsApp traz espaço duplo e espaço no fim com frequência, e os
 *     dois gastam teto sem aparecer.
 *
 * O que ela **não** faz é sanitizar: não há o que sanitizar. Todo texto do casal
 * é texto puro (RV-07), o React escapa na renderização, e este produto não usa
 * `dangerouslySetInnerHTML` em lugar nenhum.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function conferirLegenda(bruto: unknown): {
  legenda: string | null;
  recusa: Recusa | null;
} {
  if (bruto === null || bruto === undefined) return { legenda: null, recusa: null };

  if (typeof bruto !== "string") {
    return {
      legenda: null,
      recusa: { campo: "legenda", mensagem: "A legenda precisa ser texto." },
    };
  }

  const limpa = bruto.replace(/\s+/g, " ").trim();
  if (limpa === "") return { legenda: null, recusa: null };

  if (limpa.length > TETO_DA_LEGENDA) {
    return {
      legenda: null,
      recusa: {
        campo: "legenda",
        // O NÚMERO NO CORPO, e não "legenda longa demais": quem escreveu 96
        // caracteres precisa saber quantos cortar.
        mensagem: `A legenda cabe em ${TETO_DA_LEGENDA} caracteres, e você escreveu ${limpa.length}.`,
      },
    };
  }

  return { legenda: limpa, recusa: null };
}

/** Uma foto e a posição que o casal quer para ela. */
export type NovaOrdem = { id: string; ordem: number };

/**
 * A LISTA INTEIRA, conferida antes de virar uma instrução (RV-05).
 *
 * **IDS REPETIDOS SÃO RECUSA, E É A CONFERÊNCIA QUE MAIS IMPORTA AQUI.** O
 * `unnest` não reclama de duplicata: ele aplicaria as duas linhas na ordem em
 * que o Postgres resolvesse, e a foto acabaria numa das duas posições sem
 * ninguém saber qual. Uma lista com id repetido é uma lista que quem a montou
 * não sabe descrever, e o certo é recusá-la inteira.
 *
 * **NÃO É EXIGIDO QUE A LISTA COBRA TODAS AS FOTOS.** A tela sempre manda todas
 * — e é o que RV-05 pede —, mas exigir isso aqui obrigaria a rota a contar
 * antes de escrever, e uma foto enviada por outra aba no meio do caminho faria a
 * reordenação inteira falhar com uma mensagem que ninguém entenderia. Quem não
 * veio na lista fica com a ordem que tinha.
 */
export function conferirOrdem(bruto: unknown): { ordens: NovaOrdem[]; recusas: Recusa[] } {
  const recusas: Recusa[] = [];

  if (!Array.isArray(bruto) || bruto.length === 0) {
    return {
      ordens: [],
      recusas: [{ campo: "fotos", mensagem: "Mande a lista inteira das fotos, na ordem." }],
    };
  }

  const ordens: NovaOrdem[] = [];
  const vistos = new Set<string>();

  for (const item of bruto) {
    if (!item || typeof item !== "object") {
      recusas.push({ campo: "fotos", mensagem: "Cada foto da lista precisa ter id e ordem." });
      continue;
    }
    const { id, ordem } = item as { id?: unknown; ordem?: unknown };

    if (typeof id !== "string" || !ehUuid(id)) {
      recusas.push({ campo: "fotos", mensagem: "Cada foto da lista precisa ter um id válido." });
      continue;
    }
    if (vistos.has(id)) {
      recusas.push({ campo: "fotos", mensagem: "A mesma foto veio duas vezes na lista." });
      continue;
    }
    if (typeof ordem !== "number" || !Number.isSafeInteger(ordem)) {
      recusas.push({ campo: "fotos", mensagem: "A ordem precisa ser um número inteiro." });
      continue;
    }

    vistos.add(id);
    ordens.push({ id, ordem });
  }

  return { ordens: recusas.length > 0 ? [] : ordens, recusas };
}

/* ------------------------------------------------------------------ *
 * A tabela
 * ------------------------------------------------------------------ */

export type Foto = {
  id: string;
  legenda: string | null;
  largura: number;
  altura: number;
  ordem: number;
  /** Nulo = **intenção**: a linha existe, os bytes ainda não foram confirmados. */
  armazenada: boolean;
};

function linhaParaFoto(linha: Record<string, unknown>): Foto {
  return {
    id: paraTextoObrigatorio(linha.id, "evento_fotos.id"),
    legenda: paraTexto(linha.legenda),
    largura: paraInteiro(linha.largura),
    altura: paraInteiro(linha.altura),
    ordem: paraInteiro(linha.ordem),
    armazenada: linha.armazenada_em !== null && linha.armazenada_em !== undefined,
  };
}

/**
 * A INTENÇÃO — a linha nasce ANTES do objeto.
 *
 * A mesma disciplina da tabela `midias`, e pela mesma razão: o `foto_id` entra
 * na chave do objeto, então ele precisa existir antes de qualquer URL ser
 * assinada. **Se a assinatura falhar, a linha permanece** — e uma linha sem
 * `armazenada_em` não renderiza e não conta (RV-25), ou seja, ela é inofensiva.
 *
 * `ordem` nasce no fim da fila (`max + 1`), numa instrução só. Ler o máximo
 * numa consulta e inserir noutra daria duas fotos com a mesma ordem quando o
 * casal mandasse duas ao mesmo tempo — e o desempate por `criado_em` (RV-04)
 * resolveria, mas o painel mostraria duas linhas com o mesmo número.
 */
export async function criarIntencaoDeFoto(
  eventoId: string,
  medidas: { largura: number; altura: number; bytesPrevia: number | null },
  exec: Executor = sql
): Promise<Foto> {
  const linhas = await exec`
    insert into evento_fotos (evento_id, largura, altura, bytes_previa, ordem)
    select ${eventoId}::uuid, ${medidas.largura}::integer, ${medidas.altura}::integer,
           ${medidas.bytesPrevia}::integer,
           coalesce(max(ordem), 0) + 1
      from evento_fotos
     where evento_id = ${eventoId}
       and excluido_em is null
    returning id, legenda, largura, altura, ordem, armazenada_em
  `;
  return linhaParaFoto(linhas[0]);
}

/**
 * O CARIMBO — a segunda metade do contrato de rede.
 *
 * IDEMPOTENTE. Repetir a confirmação não é erro: o botão de tentar de novo
 * reenvia os dois `PUT` e reconfirma, e é assim que a falha parcial se conserta
 * sem uma máquina de estados. `coalesce(armazenada_em, now())` mantém o primeiro
 * carimbo — a foto não "chega" duas vezes.
 *
 * **AS MEDIDAS SÃO REESCRITAS AQUI, e não só na intenção.** Elas foram
 * conferidas nas duas pontas (RV-26 nomeia a confirmação), e é esta a gravação
 * que vale: entre a intenção e a confirmação o navegador pode ter refeito as
 * derivadas — o botão de tentar de novo faz exatamente isso.
 *
 * `evento_id` na cláusula `where`, sempre: foto de outro casamento devolve
 * `null`, que a rota traduz em 404. Nunca 403 — 403 confirmaria que existe.
 */
export async function confirmarFoto(
  eventoId: string,
  fotoId: string,
  medidas: { largura: number; altura: number; bytesPrevia: number | null },
  exec: Executor = sql
): Promise<Foto | null> {
  const linhas = await exec`
    update evento_fotos
       set largura       = ${medidas.largura}::integer,
           altura        = ${medidas.altura}::integer,
           bytes_previa  = ${medidas.bytesPrevia}::integer,
           armazenada_em = coalesce(armazenada_em, now()),
           atualizado_em = now()
     where id = ${fotoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning id, legenda, largura, altura, ordem, armazenada_em
  `;
  return linhas.length ? linhaParaFoto(linhas[0]) : null;
}

/**
 * AS FOTOS ARMAZENADAS, na ordem do casal — **e é a mesma lista para o site e
 * para o editor**.
 *
 * `order by ordem, criado_em` — **e nunca `id`** (RV-04). `id` é uuid aleatório,
 * e desempatar por ele faria a galeria mudar de ordem a cada inserção, sem
 * ninguém ter mexido em nada.
 *
 * **UMA INTENÇÃO QUE NUNCA CONFIRMOU NÃO APARECE EM LUGAR NENHUM**, nem no
 * editor, e isso é escolha e não descuido. Ela é uma linha sobre bytes que não
 * existem: o site não pode servi-la (RV-25) e o casal não tem o que fazer com
 * ela — o arquivo saiu do celular na sessão anterior, e o botão de tentar de
 * novo vive na sessão do envio. Mostrá-la seria uma linha quebrada que ninguém
 * consegue consertar. Ela é lixo **na tabela**, não no balde, e com teto de doze
 * por evento isso não é problema — a 0015 escreve exatamente isso, e escreve
 * também que **não há cron de limpeza**, de propósito.
 */
export async function listarFotosArmazenadas(
  eventoId: string,
  exec: Executor = sql
): Promise<Foto[]> {
  const linhas = await exec`
    select id, legenda, largura, altura, ordem, armazenada_em
      from evento_fotos
     where evento_id = ${eventoId}
       and excluido_em is null
       and armazenada_em is not null
     order by ordem asc, criado_em asc
  `;
  return linhas.map(linhaParaFoto);
}

/** Quantas fotos o site mostra hoje. É o número que o painel resume. */
export async function contarFotosArmazenadas(
  eventoId: string,
  exec: Executor = sql
): Promise<number> {
  const linhas = await exec`
    select count(*)::int as quantas
      from evento_fotos
     where evento_id = ${eventoId}
       and excluido_em is null
       and armazenada_em is not null
  `;
  return linhas.length ? paraInteiro(linhas[0].quantas) : 0;
}

/* ------------------------------------------------------------------ *
 * A escrita de V-19: legenda, ordem, exclusão
 * ------------------------------------------------------------------ */

/**
 * A LEGENDA DE UMA FOTO. `null` limpa, e limpar é uma edição legítima.
 *
 * `evento_id` na cláusula `where`, sempre: foto de outro casamento devolve
 * `null`, que a rota traduz em 404 — nunca 403, porque 403 confirmaria que ela
 * existe.
 */
export async function definirLegenda(
  eventoId: string,
  fotoId: string,
  legenda: string | null,
  exec: Executor = sql
): Promise<Foto | null> {
  const linhas = await exec`
    update evento_fotos
       set legenda       = ${legenda}::text,
           atualizado_em = now()
     where id = ${fotoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning id, legenda, largura, altura, ordem, armazenada_em
  `;
  return linhas.length ? linhaParaFoto(linhas[0]) : null;
}

/**
 * A ORDEM — **uma instrução com a lista inteira, nunca N requisições** (RV-05).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `unnest`, pelo mesmo motivo de `salvarSecoes`: o driver HTTP do Neon executa
 * **uma instrução por requisição, sem transação abraçando o arquivo**. Doze
 * `update` em sequência, numa conexão de celular à noite, deixam a ordem
 * inconsistente no meio se o quinto falhar — três fotos na posição nova, nove na
 * antiga, e nada avisando. Com `unnest`, ou as doze mudam, ou nenhuma.
 *
 * **NÃO HÁ `insert` AQUI, E POR ISSO NÃO HÁ `on conflict`.** `salvarSecoes`
 * precisa criar a linha que ainda não existe (seção sem linha é o padrão do
 * catálogo); uma foto sem linha não existe em lugar nenhum. Um `id` que não é
 * deste evento simplesmente não casa no `where` e é ignorado — e é isso que faz
 * uma lista contaminada com o id do casamento vizinho não mover nada dele.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function reordenarFotos(
  eventoId: string,
  ordens: NovaOrdem[],
  exec: Executor = sql
): Promise<void> {
  if (ordens.length === 0) return;

  const ids = ordens.map(o => o.id);
  const posicoes = ordens.map(o => o.ordem);

  await exec`
    update evento_fotos as f
       set ordem         = t.ordem,
           atualizado_em = now()
      from unnest(${ids}::uuid[], ${posicoes}::int[]) as t(id, ordem)
     where f.id = t.id
       and f.evento_id = ${eventoId}
       and f.excluido_em is null
  `;
}

/**
 * A foto, ou `null`. Existe para a rota de exclusão poder responder **404 antes
 * de tocar no balde** — apagar objeto de uma foto que não é deste casamento
 * seria a pior ordem possível dos dois passos.
 */
export async function buscarFoto(
  eventoId: string,
  fotoId: string,
  exec: Executor = sql
): Promise<Foto | null> {
  const linhas = await exec`
    select id, legenda, largura, altura, ordem, armazenada_em
      from evento_fotos
     where id = ${fotoId}
       and evento_id = ${eventoId}
       and excluido_em is null
  `;
  return linhas.length ? linhaParaFoto(linhas[0]) : null;
}

/**
 * MARCA A LINHA — **e só é chamada depois de o objeto ter saído do balde**
 * (RV-22).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ORDEM É A REGRA, e ela é o contrário da exclusão de todo o resto do produto:
 * aqui o **objeto some primeiro**, e a linha só é marcada depois. Nunca uma
 * linha que diz "apagada" sobre um arquivo que continua respondendo — que é
 * exatamente a promessa que a confirmação de tirar o site do ar passa a fazer
 * (RV-21): quem quer a foto fora de verdade apaga a foto.
 *
 * **NÃO HÁ CARÊNCIA DE 30 DIAS, ao contrário do álbum, e não é esquecimento.**
 * O álbum tem `objeto_expurgado_em` e carência porque um convidado apagar por
 * engano no meio da festa é perda real — aquele arquivo não existe em outro
 * lugar. A foto da galeria **o casal já tem no celular dele**; o produto nunca
 * foi o guardião dela. Carência aqui seria guardar um objeto que ninguém quer
 * de volta e ainda deixá-lo respondendo por trinta dias, que é o oposto do que
 * a pessoa pediu quando apertou apagar.
 *
 * A linha continua no banco (`excluido_em`), porque ela é o registro de que a
 * foto existiu; o **arquivo** é que não continua.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function marcarFotoExcluida(
  eventoId: string,
  fotoId: string,
  exec: Executor = sql
): Promise<boolean> {
  const linhas = await exec`
    update evento_fotos
       set excluido_em   = now(),
           atualizado_em = now()
     where id = ${fotoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning id
  `;
  return linhas.length > 0;
}

/* ------------------------------------------------------------------ *
 * O que a página recebe
 * ------------------------------------------------------------------ */

/**
 * Uma foto pronta para o `<img>`: endereço, medidas e legenda. Nada mais.
 *
 * O componente não recebe `id` de propósito — ele não tem o que fazer com ele.
 * Sem lightbox, sem alvo de toque e sem contador, a foto na página **não tem
 * identidade**: ela é conteúdo, como um parágrafo da história.
 */
export type FotoDoSite = {
  /** A PRÉVIA de 1600. A miniatura de 400 é do editor e nunca aparece aqui. */
  url: string;
  largura: number;
  altura: number;
  legenda: string | null;
};

/**
 * O recorte público — **pura**, e é ela que aplica as duas exclusões silenciosas.
 *
 * DUAS RAZÕES PARA UMA FOTO NÃO ENTRAR, e as duas preferem a foto a menos:
 *
 *   1. **Medidas incoerentes** (RV-26). Sem par confiável não há caixa
 *      reservada, e sem caixa reservada a página reflui ao carregar — na foto de
 *      um casal específico, meses depois, sem nada no console.
 *   2. **Sem `R2_PUBLIC_BASE`.** `urlPublicaDaFoto` devolve `null`, e o certo é
 *      não desenhar a `<img>`: um `src` vazio é uma imagem quebrada no site do
 *      casamento, que é pior que uma foto a menos pelo mesmo motivo.
 *
 * **A CONTAGEM DA LINHA INVISÍVEL SAI DAQUI** (`gtm.md` §5.17): ela conta as
 * fotos que realmente foram renderizadas, nunca um campo configurado. Uma
 * contagem que não bate com a tela é o tipo de defeito que só quem não vê a tela
 * descobre — e ela não tem como conferir.
 */
export function fotosParaOSite(eventoId: string, fotos: Foto[]): FotoDoSite[] {
  const saida: FotoDoSite[] = [];
  for (const item of fotos) {
    if (!item.armazenada) continue;
    if (!medidasCoerentes(item.largura, item.altura)) continue;
    const url = urlPublicaDaFoto(eventoId, item.id, "previa");
    if (!url) continue;
    saida.push({
      url,
      largura: item.largura,
      altura: item.altura,
      legenda: item.legenda,
    });
  }
  return saida;
}
