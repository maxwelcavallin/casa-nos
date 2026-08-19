import { origemDoQr, type OrigemDoQr } from "@/lib/analytics";

/**
 * O ENDEREÇO DO ÁLBUM — o que o QR carrega e o que o convidado lê embaixo dele.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUAS FORMAS DO MESMO ENDEREÇO, E ELAS TÊM QUE LEVAR AO MESMO LUGAR (H-04):
 *
 *   `paraQr`     o que a câmera abre. Leva `?o=<superfície>`.
 *   `paraLer`    o que está escrito por extenso, legível a 30 cm.
 *
 * O endereço escrito é a **única retentativa que o passo 1 do fluxo tem**
 * (`escopo-core.md` §1): quando o QR não lê — luz ruim, câmera velha, papel
 * amassado —, é ele que salva a foto. Por isso ele não pode ser uma versão
 * "bonita" do outro: quem digitar o que está escrito precisa cair exatamente
 * onde a câmera cairia. A única diferença permitida é o `?o=`, que é medição e
 * não destino.
 *
 * **A ROTA CURTA EXISTE DESDE 19/08/2026** (decisão do `po`). `casa-nos.app/
 * <slug>` responde **307** para `/e/<slug>/album`, preservando o `?o=` — o
 * redirecionamento mora no `proxy.ts` e a lista de segmentos reservados, com o
 * teste que varre `app/`, mora em `lib/rotas.ts`.
 *
 * O achado da F1.4 continua registrado e agora tem desfecho: o `gtm.md`
 * imprimia `casa-nos.app/ana-e-max`, o PRD §6.1 não declarava a rota, e escrever
 * o endereço do mock daria um cartão de mesa com 404. A saída não foi escolher
 * entre um endereço comprido e um que não responde — foi **tirar o 404 do
 * caminho**.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `/e/<slug>/album` — o destino real, num lugar só. */
export function caminhoDoAlbum(slug: string): string {
  return `/e/${slug}/album`;
}

/** `/<slug>` — a rota curta, que redireciona para a de cima. */
export function caminhoCurto(slug: string): string {
  return `/${slug}`;
}

/**
 * A origem (`https://host`) desta requisição.
 *
 * Vem dos cabeçalhos e não de uma variável de ambiente: o mesmo código serve o
 * domínio do casal, o `casa-nos.app` e a pré-visualização da plataforma, e um
 * QR gerado na pré-visualização precisa apontar para a pré-visualização — senão
 * o teste do casal abre o site de produção e ninguém entende por que a foto de
 * teste não apareceu.
 */
export function origemDaRequisicao(cabecalhos: Headers): string {
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "";
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? "https";
  return host ? `${protocolo}://${host}` : "";
}

/**
 * O endereço que o QR carrega, com a origem por superfície.
 *
 * **PELA ROTA CURTA.** Não é só estética de cartão: a densidade do QR cresce com
 * o número de caracteres, e cada versão a mais do símbolo são módulos menores no
 * mesmo papel. `casa-nos.app/ana-e-max?o=mesa` cabe numa versão mais baixa que
 * `casa-nos.app/e/ana-e-max/album?o=mesa` — módulo maior, leitura mais fácil sob
 * a luz de um salão, que é a única condição em que este QR será usado.
 *
 * VALOR FORA DA LISTA VIRA `direto` (H-04), e a lista é fechada em
 * `lib/analytics.ts`: o parâmetro é público e qualquer um pode escrever
 * `?o=<o que quiser>` num link colado em grupo. Texto livre virando dimensão do
 * GA4 é dado envenenado que não se limpa, e o teto de 50 dimensões
 * personalizadas não perdoa uma cheia de lixo.
 */
export function enderecoParaQr(
  origem: string,
  slug: string,
  superficie: OrigemDoQr | string | null
): string {
  const o = origemDoQr(typeof superficie === "string" ? superficie : null);
  const base = `${origem}${caminhoCurto(slug)}`;
  // `direto` não vai na URL: ele é o valor PADRÃO de quem chegou sem material
  // impresso, e escrevê-lo transformaria "chegou por um cartaz sem parâmetro"
  // em "chegou sem cartaz nenhum".
  return o === "direto" ? base : `${base}?o=${o}`;
}

/**
 * O mesmo endereço, escrito para ser lido e digitado.
 *
 * Sem o esquema (`https://`, que ninguém digita e que ocupa 8 caracteres do
 * cartão) e **sem o `?o=`** — o parâmetro é medição, e um endereço impresso com
 * uma interrogação e um sinal de igual é um endereço que a pessoa erra.
 */
export function enderecoParaLer(origem: string, slug: string): string {
  const semEsquema = origem.replace(/^https?:\/\//, "");
  return `${semEsquema}${caminhoCurto(slug)}`;
}

/* ------------------------------------------------------------------ *
 * O ENDEREÇO DO SITE — o que o casal manda para os convidados
 * ------------------------------------------------------------------ */

/**
 * O endereço do SITE do casamento (v1.0, V-11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **NÃO É O ENDEREÇO DO ÁLBUM.** As funções acima montam `casa-nos.app/<slug>`,
 * que é o QR do cartão de mesa e leva ao álbum. Este é o link que o casal cola
 * no convite e no grupo do WhatsApp, e ele leva à página do casamento.
 *
 * Confundir os dois seria mandar 150 pessoas ao envio de fotos meses antes da
 * festa — daí duas funções com nomes que não se parecem, e não um parâmetro.
 *
 * **O DOMÍNIO GANHA DO `/e/<slug>` quando existir.** É o endereço que o casal
 * pagou e escolheu; o `/e/<slug>` é a forma de o site existir enquanto o DNS não
 * aponta. Mostrar o segundo a quem já tem o primeiro é ensinar o casal a
 * divulgar o endereço errado.
 *
 * A origem vem dos cabeçalhos (`origemDaRequisicao`) e não de variável de
 * ambiente, pelo mesmo motivo do QR: o mesmo código serve produção e a
 * pré-visualização da plataforma, e um endereço copiado na pré-visualização
 * precisa abrir a pré-visualização.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function enderecoDoSite(
  origem: string,
  slug: string,
  dominio: string | null = null
): string {
  if (dominio) return `https://${dominio}`;
  return `${origem}/e/${slug}`;
}

/** O mesmo endereço sem o `https://`, para ser lido na tela e digitado. */
export function enderecoDoSiteParaLer(
  origem: string,
  slug: string,
  dominio: string | null = null
): string {
  return enderecoDoSite(origem, slug, dominio).replace(/^https?:\/\//, "");
}

/* ------------------------------------------------------------------ *
 * A conferência dos 24 caracteres — avisa, e nunca recusa
 * ------------------------------------------------------------------ */

/**
 * O teto do endereço impresso no cartão de mesa.
 *
 * 24 caracteres é o que o `design-system.md` mede como legível **de pé, a um
 * metro**, no corpo que o cartão usa. Acima disso o endereço não some: ele
 * quebra em duas linhas, ou encolhe — e o endereço escrito é a única retentativa
 * do passo 1.
 */
export const TETO_DO_ENDERECO_IMPRESSO = 24;

export type ConferenciaDoEndereco = {
  endereco: string;
  caracteres: number;
  /** Quantos sobram para o slug depois do domínio e da barra. */
  sobramParaOSlug: number;
  cabe: boolean;
};

/**
 * Confere o endereço impresso contra o teto — **com aviso e sem bloqueio**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEGRADAR E AVISAR, NUNCA RECUSAR (decisão do `po`, 19/08/2026).
 *
 * A tentação óbvia era recusar o slug longo na tela do dia, ou encurtá-lo
 * sozinho. As duas são piores que o problema: recusar impede o casal de se
 * chamar como ele quer no próprio endereço, e encurtar sozinho produz um
 * endereço que **ninguém escolheu** e que o casal descobre impresso em 40
 * cartões.
 *
 * O que a tela faz com isto: mostra a conta ("`casa-nos.app/` são 13; sobram 11
 * para o nome"), oferece encurtar, e imprime o que o casal decidir. Quem quiser
 * um slug maior imprime o endereço maior — em duas linhas, e sabendo disso.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function conferirEnderecoImpresso(
  origem: string,
  slug: string
): ConferenciaDoEndereco {
  const endereco = enderecoParaLer(origem, slug);
  const semEsquema = origem.replace(/^https?:\/\//, "");
  // +1 pela barra que separa o domínio do slug.
  const sobram = TETO_DO_ENDERECO_IMPRESSO - semEsquema.length - 1;
  return {
    endereco,
    caracteres: endereco.length,
    sobramParaOSlug: Math.max(0, sobram),
    cabe: endereco.length <= TETO_DO_ENDERECO_IMPRESSO,
  };
}
