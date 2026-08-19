import { classificarResposta } from "@/lib/fila/maquina";
import type { FaixaLocal, TipoDeFalha } from "@/lib/fila/tipos";
import type { OrigemDaFoto, Visibilidade } from "@/lib/midias";

/**
 * A REDE DA FILA — a única superfície que fala com o servidor e com o R2.
 *
 * Ela é uma interface antes de ser uma implementação, e o motivo é a única
 * coisa que este produto precisa provar: **a fila sobrevive ao wifi do salão**.
 * Com a rede injetada, `test/fila-motor.test.ts` reproduz o salão sem salão —
 * modo avião intermitente, portal cativo devolvendo HTML com status 200, 500 do
 * servidor, URL expirada — e o CI roda isso a cada commit. Uma implementação
 * chumbada dentro do motor transformaria essa prova numa visita ao salão, que
 * acontece uma vez, na noite da festa.
 */

export type ItemDeIntencaoEnviado = {
  client_media_id: string;
  lote_id: string;
  bytes: number;
  tipo_arquivo: string;
  hash_conteudo: string | null;
  visibilidade: Visibilidade;
  origem: OrigemDaFoto | null;
  enfileirada_offline: boolean;
};

export type RespostaDeIntencao = {
  situacao: "ok" | "fora_da_janela" | "tipo_nao_suportado" | "sem_permissao" | "falha";
  falha?: TipoDeFalha;
  faixaLenta?: boolean;
  itens?: Array<{
    client_media_id: string;
    midia_id: string;
    ja_existia: boolean;
    urls: Partial<Record<FaixaLocal, string>>;
    expira_em: string;
  }>;
};

export type ResultadoDoEnvio = { sucesso: boolean; falha: TipoDeFalha | null };

export type Rede = {
  intencao(
    eventoId: string,
    corpo: { lote_id: string; itens: ItemDeIntencaoEnviado[] }
  ): Promise<RespostaDeIntencao>;
  enviarFaixa(url: string, dados: Blob, tipoArquivo: string): Promise<ResultadoDoEnvio>;
  confirmar(
    eventoId: string,
    midiaId: string,
    corpo: { faixa: "previa" | "original"; bytes_previa?: number; largura?: number; altura?: number }
  ): Promise<ResultadoDoEnvio>;
  relatarErro(corpo: {
    evento_id: string;
    midia_id?: string | null;
    tipo_erro: "rede" | "portal" | "servidor" | "arquivo";
    mensagem: string;
  }): Promise<void>;
};

async function comoResultado(resposta: Response, urlPedida: string): Promise<ResultadoDoEnvio> {
  return classificarResposta({
    ok: resposta.ok,
    status: resposta.status,
    tipoDeConteudo: resposta.headers.get("content-type"),
    redirecionada: resposta.redirected,
    urlFinal: resposta.url,
    urlPedida,
  });
}

export function redeDoNavegador(): Rede {
  return {
    async intencao(eventoId, corpo) {
      try {
        const resposta = await fetch(`/api/eventos/${eventoId}/midias/intencao`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(corpo),
        });

        // 409 e 422 NÃO são falha de rede: são estado, e o motor os trata como
        // tal. Tratá-los como falha faria a fila retentar para sempre uma coisa
        // que nunca vai mudar sozinha — e o indicador diria "mandando" a noite
        // inteira sobre uma foto que o servidor já recusou.
        if (resposta.status === 409) return { situacao: "fora_da_janela" };
        if (resposta.status === 422) return { situacao: "tipo_nao_suportado" };
        if (resposta.status === 403 || resposta.status === 404) {
          return { situacao: "sem_permissao" };
        }

        const classificada = await comoResultado(resposta, "/api");
        if (!classificada.sucesso) {
          return { situacao: "falha", falha: classificada.falha ?? "rede" };
        }

        const corpoResposta = (await resposta.json()) as {
          itens: RespostaDeIntencao["itens"];
          faixa_lenta?: boolean;
        };
        return {
          situacao: "ok",
          faixaLenta: corpoResposta.faixa_lenta === true,
          itens: corpoResposta.itens,
        };
      } catch {
        return { situacao: "falha", falha: "rede" };
      }
    },

    async enviarFaixa(url, dados, tipoArquivo) {
      try {
        const resposta = await fetch(url, {
          method: "PUT",
          body: dados,
          headers: { "content-type": tipoArquivo },
        });
        return await comoResultado(resposta, url);
      } catch {
        return { sucesso: false, falha: "rede" };
      }
    },

    async confirmar(eventoId, midiaId, corpo) {
      try {
        const resposta = await fetch(
          `/api/eventos/${eventoId}/midias/${midiaId}/confirmacao`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(corpo),
          }
        );
        return await comoResultado(resposta, "/api");
      } catch {
        return { sucesso: false, falha: "rede" };
      }
    },

    async relatarErro(corpo) {
      try {
        // `keepalive` para o relato sobreviver ao fechamento da aba. Sem ele, o
        // erro que mais interessa — o do aparelho que desistiu e foi embora —
        // é justamente o que nunca chega.
        await fetch("/api/interno/erro-cliente", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(corpo),
          keepalive: true,
        });
      } catch {
        // Relatar erro não pode gerar erro. Se o relato não sai, o produto
        // continua: a fila é o que importa, e o registro é diagnóstico.
      }
    },
  };
}
