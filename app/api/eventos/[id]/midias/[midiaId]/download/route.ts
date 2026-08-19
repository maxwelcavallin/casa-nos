import { NextResponse } from "next/server";

import { autorizar, naoEncontrado, respostaDeErro, rotaDeApi } from "@/lib/api";
import { agoraNoServidor } from "@/lib/datas";
import { ehUuid } from "@/lib/ids";
import { buscarMidia } from "@/lib/midias";
import { assinarDownload, configuracaoR2, VALIDADE_DA_LEITURA_SEGUNDOS } from "@/lib/r2";
import { participacaoDaSessao } from "@/lib/sessao";

/**
 * BAIXAR A FOTO (H-20).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O BOTÃO DIZ QUAL VERSÃO ESTÁ BAIXANDO, E ESTA ROTA DIZ TAMBÉM.** A resposta
 * carrega `faixa: "original" | "previa"`, e é ela que decide o texto do botão na
 * tela — `Baixar` quando o original já chegou, `Baixar (versão menor)` quando
 * não. *"Nunca entrega prévia dizendo que é original"* é o critério da história,
 * e ele só é cumprível se o servidor for quem diz o que está mandando: o cliente
 * não sabe se o original terminou de subir.
 *
 * O ALCANCE VEM DA MATRIZ, e não de um `if` de perfil: `proprias` para o
 * convidado (`participacao_id` entra na cláusula), `todas` para o casal e o
 * dono. **O moderador não baixa** — ele modera e não guarda (PRD §7), e recebe
 * 403 antes de chegar aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A URL É ASSINADA, VALE 15 MINUTOS E É GERADA POR REQUISIÇÃO (critério da
 * H-20). O original mora em `prv/` em toda visibilidade (RN-33): ele carrega
 * EXIF, inclusive GPS (RN-18), e nunca teve endereço público. É por isso que
 * esta rota é a **única** porta para ele.
 *
 * **REDIRECIONA, não faz proxy.** Um `fetch` do arquivo aqui dentro passaria 90
 * MB pela função — memória, tempo e um limite de resposta que a plataforma
 * impõe. O 307 manda o navegador direto ao balde, e a foto de 90 MB baixa sem
 * travar a página, que é o caso "cheio" da história.
 */

const CAMINHO = "/api/eventos/[id]/midias/[midiaId]/download";

export const GET = rotaDeApi(CAMINHO, async (_pedido, contexto) => {
  const { id, midiaId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(midiaId)) return naoEncontrado();

  const acesso = await autorizar(id, "midia.baixar");
  if (!acesso.ok) return acesso.resposta;

  const participacao = participacaoDaSessao(acesso.sessao);
  const proprias = acesso.alcance === "proprias";
  if (proprias && !participacao) return naoEncontrado();

  const midia = await buscarMidia(
    acesso.evento.id,
    midiaId,
    proprias ? participacao!.id : null
  );
  if (!midia) return naoEncontrado();

  const configuracao = configuracaoR2();
  if (!configuracao) return respostaDeErro(503, "armazenamento indisponivel");

  /**
   * O ORIGINAL QUANDO ELE EXISTE; A PRÉVIA QUANDO NÃO. E a resposta diz qual.
   *
   * Baixar a prévia não é um consolo escondido: ela é 1600 px e serve para
   * mandar num grupo. O que não pode acontecer é a pessoa achar que guardou o
   * arquivo da câmera e ter guardado outra coisa.
   */
  const faixa = midia.originalArmazenadaEm ? "original" : "previa";
  if (faixa === "previa" && !midia.previaArmazenadaEm) {
    // Nem uma nem outra chegou: não há o que baixar, e dizer "erro" seria
    // impreciso — a foto ainda está subindo.
    return respostaDeErro(409, "a foto ainda esta chegando");
  }

  const url = await assinarDownload(
    configuracao,
    acesso.evento.id,
    midia.id,
    midia.tipoArquivo,
    midia.visibilidade,
    faixa,
    agoraNoServidor()
  );

  return NextResponse.json(
    {
      url,
      faixa,
      expira_em_segundos: VALIDADE_DA_LEITURA_SEGUNDOS,
    },
    {
      // Nunca cacheada, em lugar nenhum: a resposta contém uma credencial de
      // leitura, e uma borda que a guarde a entrega ao pedido seguinte.
      headers: { "cache-control": "no-store" },
    }
  );
});
