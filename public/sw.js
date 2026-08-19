/**
 * O service worker do album (H-05).
 *
 * O QUE ELE EXISTE PARA RESOLVER: "segunda visita sem rede abre a casca e a
 * fila". O convidado abre o album as 21h, o wifi do salao cai as 23h, ele volta
 * ao link para ver se as fotos dele foram — e sem isto ele recebe o dinossauro
 * do navegador. A fila esta no IndexedDB, intacta, e ele nao tem como saber.
 *
 * DUAS ESTRATEGIAS, E SO DUAS:
 *
 * 1. NAVEGACAO -> rede primeiro, cache depois. Rede primeiro porque a pagina
 *    carrega o estado da janela de envio e a participacao: servir a copia velha
 *    quando ha rede mostraria o botao de enviar depois de os envios terem sido
 *    encerrados.
 * 2. ESTATICO (`/_next/static/`) -> cache primeiro. Esses arquivos tem hash no
 *    nome: o conteudo nunca muda para uma mesma URL, entao ir a rede e desperdicio
 *    puro no uplink que este produto disputa.
 *
 * O QUE ELE NAO FAZ, DE PROPOSITO:
 *
 * - Nao guarda resposta de API. Feed e painel mudam a cada segundo durante a
 *   festa, e uma copia de trinta segundos atras mostrada como atual e pior que
 *   um erro honesto.
 * - Nao faz `background sync`. O Safari do iOS nao implementa, e metade do
 *   publico desta festa esta nele. Um mecanismo que funciona em metade dos
 *   aparelhos produz uma promessa que a interface nao pode fazer — e a H-07 e
 *   explicita: o texto fala em "quando voce voltar", nunca em segundo plano.
 * - Nao guarda o `PUT` do R2. Quem retenta e a fila, com o registro no disco.
 */

const CACHE = "casa-nos-casca-v1";

self.addEventListener("install", () => {
  // Sem pre-cache de lista fixa: os nomes dos arquivos do Next tem hash e mudam
  // a cada deploy. Uma lista escrita a mao aqui envelhece no primeiro build e
  // faz a instalacao inteira falhar por um 404.
  self.skipWaiting();
});

self.addEventListener("activate", evento => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter(nome => nome !== CACHE).map(nome => caches.delete(nome)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", evento => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (pedido.mode === "navigate") {
    evento.respondWith(
      (async () => {
        try {
          const resposta = await fetch(pedido);
          const cache = await caches.open(CACHE);
          cache.put(pedido, resposta.clone());
          return resposta;
        } catch (falha) {
          const guardada = await caches.match(pedido);
          if (guardada) return guardada;
          throw falha;
        }
      })()
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/marca/")) {
    evento.respondWith(
      (async () => {
        const guardada = await caches.match(pedido);
        if (guardada) return guardada;
        const resposta = await fetch(pedido);
        const cache = await caches.open(CACHE);
        cache.put(pedido, resposta.clone());
        return resposta;
      })()
    );
  }
});
