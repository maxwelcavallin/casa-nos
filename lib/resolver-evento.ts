import { headers } from "next/headers";
import { cache } from "react";

import { buscarEventoPorDominio, buscarEventoPorSlug, type Evento } from "@/lib/eventos";

/**
 * Da requisição para o inquilino.
 *
 * ORDEM, e o porquê de cada degrau:
 *
 * 1. **Domínio.** É o caminho de produção. `anaemax.com.br` chega, a tabela
 *    `evento_dominios` responde qual casamento é. O segundo casal aponta o
 *    domínio dele e ganha um site — uma linha de INSERT, sem deploy.
 *
 * 2. **`EVENTO_SLUG_PADRAO`.** Em `localhost:3000` e no domínio de
 *    pré-visualização da Vercel, o host não bate com cadastro nenhum. Sem este
 *    degrau, o próprio dono não conseguiria ver o site antes de apontar o DNS.
 *    A variável não existe em produção — lá, quem responde é o domínio.
 *
 * 3. **404.** Domínio desconhecido é "não encontrado", e não a página do
 *    primeiro casamento que aparecer na consulta. Escolher um evento
 *    "qualquer" quando o domínio não bate é como um produto multi-inquilino
 *    mostra o casamento errado para o convidado errado.
 *
 * `cache` do React é o que impede a consulta de rodar duas vezes por requisição:
 * `generateMetadata` e o componente da página pedem o mesmo evento, e sem isto
 * seriam duas idas ao banco para pintar uma tela.
 */
export const eventoDaRequisicao = cache(async (): Promise<Evento | null> => {
  const cabecalhos = await headers();

  // `x-forwarded-host` é o que a Vercel preenche com o domínio que o visitante
  // digitou; `host` sozinho traz o domínio interno do deploy e nunca bateria
  // com o cadastro.
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host");

  const porDominio = await buscarEventoPorDominio(host);
  if (porDominio) return porDominio;

  const slugPadrao = process.env.EVENTO_SLUG_PADRAO;
  if (slugPadrao) return buscarEventoPorSlug(slugPadrao);

  return null;
});

/** Usado por `/e/[slug]`, onde o inquilino vem da URL e não do domínio. */
export const eventoPorSlug = cache(
  async (slug: string): Promise<Evento | null> => buscarEventoPorSlug(slug)
);
