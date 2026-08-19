import {
  chaveDoBlob,
  type FaixaLocal,
  type ItemDaFila,
} from "@/lib/fila/tipos";

/**
 * O armazém local — IndexedDB, com a interface que o motor consome.
 *
 * POR QUE INDEXEDDB E NÃO `localStorage`: `localStorage` guarda string, tem
 * ~5 MB e é síncrono. Uma foto de celular tem 4 MB. Não é uma questão de
 * preferência — a primeira foto não caberia.
 *
 * DOIS DEPÓSITOS, E A SEPARAÇÃO É FUNCIONAL: `itens` guarda o registro (pequeno,
 * lido inteiro a cada ciclo) e `blobs` guarda os bytes (grandes, lidos um por
 * vez e **apagados assim que a faixa confirma**). Guardar o blob dentro do
 * registro faria cada varredura da fila carregar dezenas de megabytes na
 * memória de um celular que já está com dificuldade.
 *
 * A interface existe para que `test/fila-motor.test.ts` rode com um armazém em
 * memória: jsdom não tem IndexedDB, e um teste que depende de navegador não roda
 * no CI — que é a única verificação que existe antes do convidado abrir a
 * página.
 */

export type Armazem = {
  listar(eventoId: string): Promise<ItemDaFila[]>;
  salvar(item: ItemDaFila): Promise<void>;
  remover(clientMediaId: string): Promise<void>;
  lerBlob(clientMediaId: string, faixa: FaixaLocal): Promise<Blob | null>;
  gravarBlob(clientMediaId: string, faixa: FaixaLocal, dados: Blob): Promise<void>;
  apagarBlob(clientMediaId: string, faixa: FaixaLocal): Promise<void>;
};

const BANCO = "casa-nos-fila";
const VERSAO = 1;
const ITENS = "itens";
const BLOBS = "blobs";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    const pedido = indexedDB.open(BANCO, VERSAO);
    pedido.onupgradeneeded = () => {
      const bd = pedido.result;
      if (!bd.objectStoreNames.contains(ITENS)) {
        const deposito = bd.createObjectStore(ITENS, { keyPath: "clientMediaId" });
        // O índice por evento existe porque um aparelho pode ter ido a dois
        // casamentos. Sem ele, a fila de um apareceria no indicador do outro.
        deposito.createIndex("porEvento", "eventoId", { unique: false });
      }
      if (!bd.objectStoreNames.contains(BLOBS)) {
        bd.createObjectStore(BLOBS, { keyPath: "chave" });
      }
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

function comoPromessa<T>(pedido: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rejeitar) => {
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

/**
 * Pede armazenamento persistente ao navegador (H-07).
 *
 * A RECUSA NÃO QUEBRA NADA, e é o caso comum: quase todo navegador nega sem
 * interação prévia. Sem persistência, o sistema pode limpar o IndexedDB sob
 * pressão de espaço — o que é um risco real num celular cheio de fotos, e é
 * justamente por isso que o pedido é feito. O retorno é registrado para que a
 * noite da festa tenha esse dado, e não uma suposição.
 */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function armazemDoNavegador(): Armazem {
  return {
    async listar(eventoId) {
      const bd = await abrir();
      const transacao = bd.transaction(ITENS, "readonly");
      const indice = transacao.objectStore(ITENS).index("porEvento");
      const itens = await comoPromessa<ItemDaFila[]>(
        indice.getAll(eventoId) as IDBRequest<ItemDaFila[]>
      );
      bd.close();
      return itens;
    },

    async salvar(item) {
      const bd = await abrir();
      const transacao = bd.transaction(ITENS, "readwrite");
      await comoPromessa(transacao.objectStore(ITENS).put(item));
      bd.close();
    },

    async remover(clientMediaId) {
      const bd = await abrir();
      const transacao = bd.transaction(ITENS, "readwrite");
      await comoPromessa(transacao.objectStore(ITENS).delete(clientMediaId));
      bd.close();
    },

    async lerBlob(clientMediaId, faixa) {
      const bd = await abrir();
      const transacao = bd.transaction(BLOBS, "readonly");
      const registro = await comoPromessa<{ dados: Blob } | undefined>(
        transacao.objectStore(BLOBS).get(chaveDoBlob(clientMediaId, faixa)) as IDBRequest<
          { dados: Blob } | undefined
        >
      );
      bd.close();
      return registro?.dados ?? null;
    },

    async gravarBlob(clientMediaId, faixa, dados) {
      const bd = await abrir();
      const transacao = bd.transaction(BLOBS, "readwrite");
      await comoPromessa(
        transacao
          .objectStore(BLOBS)
          .put({ chave: chaveDoBlob(clientMediaId, faixa), clientMediaId, faixa, dados })
      );
      bd.close();
    },

    async apagarBlob(clientMediaId, faixa) {
      const bd = await abrir();
      const transacao = bd.transaction(BLOBS, "readwrite");
      await comoPromessa(
        transacao.objectStore(BLOBS).delete(chaveDoBlob(clientMediaId, faixa))
      );
      bd.close();
    },
  };
}
