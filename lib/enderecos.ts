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
 * **ACHADO REGISTRADO, e não resolvido por mim:** o `gtm.md` imprime o endereço
 * curto como `casa-nos.app/ana-e-max` e o PRD §6.1 não declara nenhuma rota
 * `/<slug>` — o álbum mora em `/e/<slug>/album`. Escrever o endereço do mock
 * daria um cartão de mesa com um endereço que responde 404, que é pior que um
 * endereço comprido. Está implementado o endereço **verdadeiro**; encurtá-lo é
 * uma rota nova e uma decisão do `po`. Ver `docs/fatia-1-f1-3-f1-4.md`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `/e/<slug>/album` — o caminho do álbum, num lugar só. */
export function caminhoDoAlbum(slug: string): string {
  return `/e/${slug}/album`;
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
  const base = `${origem}${caminhoDoAlbum(slug)}`;
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
  return `${semEsquema}${caminhoDoAlbum(slug)}`;
}
