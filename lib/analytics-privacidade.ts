import { ehUuid } from "@/lib/ids";
import { segmentosPublicos } from "@/lib/rotas";

/**
 * MASCARAMENTO DE URL — nenhum endereço deste produto sai para o GA4 legível.
 *
 * O VAZAMENTO QUE ORIGINOU ESTE ARQUIVO: o `gtag('config')` mandava a URL real
 * em todo `page_view`. A URL real é `/e/ana-e-max` e o título real é
 * "Ana Flávia e Maxwel · 22 de agosto de 2027". O nome do casal — dado pessoal
 * de duas pessoas que não são usuárias de nada — ia para o Google em toda
 * abertura de página, sem servir a nenhuma pergunta que alguém fosse fazer.
 * `wedding_id` já era dimensão registrada e responde a mesma pergunta sendo
 * opaco.
 *
 * POR QUE LISTA DE PERMITIDOS E NÃO LISTA DE PROIBIDOS: hoje o identificador
 * legível é o slug do casal. Amanhã são as rotas de álbum, de convidado e de
 * mídia — e o convidado tem nome próprio, que é PII de terceiro, pior que a do
 * casal. Uma lista de proibidos protege o que já se conhece e deixa passar tudo
 * que for criado depois, que é exatamente quando ninguém está olhando. Aqui o
 * padrão é mascarar: segmento de caminho que ninguém declarou como público vira
 * `_`. Rota nova nasce mascarada sem nenhum trabalho, e quem quiser vê-la no
 * relatório declara a palavra abaixo — de propósito, num commit que alguém lê.
 *
 * NADA AQUI TOCA A URL DO NAVEGADOR. O convidado continua vendo `/e/ana-e-max`;
 * o que muda é só o que se conta ao terceiro.
 */

/**
 * O host que substitui o host real.
 *
 * `.invalid` é reservado pela RFC 2606 justamente para isto: nunca resolve,
 * nunca vai existir, e quem abrir o relatório do GA4 vê de imediato que aquele
 * endereço é sintético em vez de procurar um domínio que não existe.
 *
 * O host real também vaza: o casamento no ar mora em domínio próprio, e um
 * domínio próprio de casamento é o nome do casal escrito de outro jeito.
 * Separar inquilino é trabalho do `wedding_id`, não do host.
 */
export const HOST_MASCARADO = "casa-nos.invalid";

/** O que entra no lugar de um segmento que identifica alguém. */
export const SEGMENTO_MASCARADO = "_";

/**
 * Palavras de caminho que NÃO identificam ninguém e podem aparecer no
 * relatório.
 *
 * A LISTA SAIU DAQUI E FOI PARA `lib/rotas.ts` na Fatia 1, junto com a
 * declaração das telas. O motivo é a decisão P14: a máscara vale para toda
 * rota, **inclusive as que ainda não existem**, e uma lista que mora longe do
 * lugar onde a rota nasce é uma lista que a rota nova não atualiza. Agora quem
 * cria uma tela declara os segmentos dela no mesmo objeto, no mesmo commit — e
 * `test/analytics-mascara-rotas.test.ts` varre a lista de rotas e falha se
 * qualquer uma delas mandaria identificador legível ao GA4.
 */
const SEGMENTOS_PUBLICOS = segmentosPublicos();

/**
 * Parâmetros de consulta preservados. Só campanha, e nada mais.
 *
 * O resto da string de consulta é descartado inteiro. Uma consulta é o lugar
 * mais fácil do mundo para um nome aparecer sem ninguém planejar —
 * `?convidado=Joao`, `?nome=Ana`, um link de recuperação com telefone — e o
 * GA4 não tem como distinguir. Preservar por lista fechada é a única forma de o
 * campo novo de amanhã não vazar sozinho.
 */
const PARAMETROS_PRESERVADOS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/**
 * O prefixo de inquilino no caminho: `/e/<slug>`.
 *
 * As duas formas de endereçar o mesmo casamento — domínio próprio na raiz e
 * `/e/<slug>` — colapsam no mesmo caminho mascarado. Ganho colateral do
 * conserto: o relatório para de fragmentar o mesmo casamento em dois endereços,
 * e para de fragmentar de novo no dia em que um slug for renomeado.
 */
const PREFIXO_DE_INQUILINO = "e";

function decodificar(segmento: string): string {
  try {
    return decodeURIComponent(segmento);
  } catch {
    // `%` solto na URL faz `decodeURIComponent` estourar. Segmento que não
    // decodifica é segmento que ninguém declarou público de qualquer forma.
    return segmento;
  }
}

function analisar(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/**
 * O id opaco que representa o casamento no relatório.
 *
 * Se o que chegou não for uuid, vira `_`. Isso não é paranoia gratuita: o
 * componente recebe `evento.id`, e `evento.slug` está a um caractere de
 * distância no autocompletar. Trocar um pelo outro repõe o vazamento exato que
 * este arquivo existe para fechar, e sem esta linha ninguém perceberia.
 */
function idOpaco(weddingId: string): string {
  return ehUuid(weddingId) ? weddingId : SEGMENTO_MASCARADO;
}

/**
 * O caminho mascarado — sempre `/e/<wedding_id>` mais o que sobrar do caminho
 * original depois da lista de permitidos.
 *
 * `/`                                  → `/e/<id>`
 * `/e/ana-e-max`                       → `/e/<id>`
 * `/e/ana-e-max/album`                 → `/e/<id>/album`
 * `/e/ana-e-max/convidado/joao-silva`  → `/e/<id>/convidado/_`
 * `/rota-que-ainda-nao-existe`         → `/e/<id>/_`
 */
export function caminhoMascarado(href: string, weddingId: string): string {
  const id = idOpaco(weddingId);
  const url = analisar(href);
  if (!url) return `/e/${id}`;

  const segmentos = url.pathname.split("/").filter(Boolean).map(decodificar);

  // Tira o prefixo de inquilino junto com o slug que vem colado nele. É o único
  // par de segmentos que se conhece pela posição, e não pelo nome.
  if (segmentos[0] === PREFIXO_DE_INQUILINO) segmentos.splice(0, 2);

  const resto = segmentos.map(s =>
    SEGMENTOS_PUBLICOS.has(s) ? s : SEGMENTO_MASCARADO
  );

  return [`/e/${id}`, ...resto].join("/");
}

/**
 * A URL completa que vai no `page_location`.
 *
 * O fragmento (`#...`) some inteiro — ele nunca chega ao servidor, mas chega ao
 * GA4 pelo `page_location`, e é onde um "#ana-e-max" viveria sem ninguém notar.
 */
export function localizacaoMascarada(href: string, weddingId: string): string {
  const caminho = caminhoMascarado(href, weddingId);
  const url = analisar(href);

  const preservados = new URLSearchParams();
  if (url) {
    for (const nome of PARAMETROS_PRESERVADOS) {
      const valor = url.searchParams.get(nome);
      if (valor) preservados.set(nome, valor);
    }
  }

  const consulta = preservados.toString();
  return `https://${HOST_MASCARADO}${caminho}${consulta ? `?${consulta}` : ""}`;
}

/**
 * A referência que vai no `page_referrer`.
 *
 * Referência de dentro do produto é URL do produto: mascarada como qualquer
 * outra. Referência de fora é sinal de aquisição legítimo e fica — mas só a
 * origem, sem caminho e sem consulta. O caso concreto que essa poda pega é o
 * redirecionador do Instagram, que carrega a URL de destino inteira dentro da
 * própria consulta: `l.instagram.com/?u=https%3A%2F%2F...%2Fe%2Fana-e-max`.
 * Guardar a referência crua devolveria o slug pela porta dos fundos.
 */
export function referenciaMascarada(
  referencia: string,
  href: string,
  weddingId: string
): string {
  if (!referencia) return "";

  const origem = analisar(referencia);
  if (!origem) return "";

  const atual = analisar(href);
  if (atual && origem.origin === atual.origin) {
    return localizacaoMascarada(referencia, weddingId);
  }

  return `${origem.origin}/`;
}
