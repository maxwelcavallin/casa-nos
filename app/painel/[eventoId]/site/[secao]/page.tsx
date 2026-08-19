import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CascaDoEditor } from "@/components/painel/site/CascaDoEditor";
import { EditorDaCapa } from "@/components/painel/site/EditorDaCapa";
import { EditorDaHistoria } from "@/components/painel/site/EditorDaHistoria";
import { EditorDaProgramacao } from "@/components/painel/site/EditorDaProgramacao";
import { EditorDasPerguntas } from "@/components/painel/site/EditorDasPerguntas";
import { EditorDeIndicacoes } from "@/components/painel/site/EditorDeIndicacoes";
import { EditorDeOnde } from "@/components/painel/site/EditorDeOnde";
import { podeNoEvento } from "@/lib/autorizacao";
import {
  buscarHistoria,
  listarPerguntas,
  listarProgramacao,
} from "@/lib/conteudo-do-site";
import { buscarEventoPorId } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { listarIndicacoesDoPainel } from "@/lib/indicacoes";
import {
  ehChaveDeSecao,
  listarSecoes,
  secaoDoCatalogo,
  SECOES_COM_EDITOR,
} from "@/lib/secoes";
import { sessaoDoEvento } from "@/lib/sessao";

/**
 * `/painel/[eventoId]/site/[secao]` — o editor de uma seção (v1.0, V-04 a V-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **DOIS PARÂMETROS, DOIS VERIFICADORES, OS DOIS ANTES DE QUALQUER CONSULTA**
 * (`dados.md` §3):
 *
 *   `[eventoId]`  `ehUuid()`         — uuid torto estoura `22P02` e vira 500
 *   `[secao]`     `ehChaveDeSecao()` — **lista de permitidos derivada do
 *                                      catálogo**, e não expressão regular
 *
 * Uma expressão regular aceitaria `programacaozinha`, a consulta voltaria vazia,
 * e o casal veria uma tela em branco em vez de 404.
 *
 * **CHAVE SEM EDITOR TAMBÉM É 404.** `SECOES_COM_EDITOR` (lib/secoes.ts) é o
 * mapa de quem já tem tela, e
 * `test/secoes-catalogo.test.ts` exige que ele cubra o catálogo inteiro. Enquanto
 * uma seção estiver no catálogo e fora do mapa, o endereço dela **não abre** — em
 * vez de abrir uma tela que não edita nada, que é a meia funcionalidade que esta
 * versão existe para não ter.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Título literal (RN-31): sem nome de casal, sem data.
  title: "Editar uma seção do site",
  robots: { index: false, follow: false },
};

export default async function PaginaDoEditorDeSecao({
  params,
}: {
  params: Promise<{ eventoId: string; secao: string }>;
}) {
  const { eventoId, secao } = await params;
  if (!ehUuid(eventoId)) notFound();
  if (!ehChaveDeSecao(secao)) notFound();
  if (!SECOES_COM_EDITOR.has(secao)) notFound();

  const evento = await buscarEventoPorId(eventoId);
  if (!evento) notFound();

  const sessao = await sessaoDoEvento(evento.id);
  // 404 e não 403: o casal do casamento A não descobre que o id do B existe.
  if (podeNoEvento(sessao, "site.editar", evento) === "nao") notFound();

  const catalogo = secaoDoCatalogo(secao);
  const secoes = await listarSecoes(evento.id);
  const estado = secoes.find(s => s.chave === secao);

  const casca = {
    eventoId: evento.id,
    titulo: catalogo.nome,
    explicacao: catalogo.explicacao,
    // O selo do dono sai do próprio acesso, e não de `medicao.ver`: aquela ação
    // é do álbum e responde `nao` com a flag desligada, o que apagaria o selo
    // justamente na v1.0.
    ehDono: sessao.tipo === "casal" && sessao.acesso.dono,
    ativa: estado?.ativa ?? true,
  };

  if (secao === "capa") {
    return (
      <CascaDoEditor {...casca}>
        <EditorDaCapa
          dados={{
            eventoId: evento.id,
            nomeCasal: evento.nomeCasal,
            // `date` e `time` viajam como STRING, do banco até o `<input>`, sem
            // passar por `Date` em canto nenhum (RV-10). O `<input type="time">`
            // fala `HH:MM`; o Postgres devolve `HH:MM:SS`.
            dataEvento: evento.dataEvento,
            horaEvento: evento.horaEvento ? evento.horaEvento.slice(0, 5) : "",
            horaPublicada: evento.horaPublicada,
            cidade: evento.cidade,
            uf: evento.uf,
          }}
        />
      </CascaDoEditor>
    );
  }

  if (secao === "onde") {
    return (
      <CascaDoEditor {...casca}>
        <EditorDeOnde
          dados={{
            eventoId: evento.id,
            localNome: evento.localNome ?? "",
            localNomePublicado: evento.localNomePublicado,
            localRevelacao: evento.localRevelacao,
            // Coordenada é `numeric` e já chegou como número pela fronteira
            // (`lib/serializar-linha.ts`). Aqui ela vira texto porque o campo é
            // de texto — e vazio significa "ainda não tem ponto".
            localLatitude: evento.localLatitude === null ? "" : String(evento.localLatitude),
            localLongitude:
              evento.localLongitude === null ? "" : String(evento.localLongitude),
            localRaioMetros:
              evento.localRaioMetros === null ? "" : String(evento.localRaioMetros),
            localEndereco: evento.localEndereco ?? "",
          }}
        />
      </CascaDoEditor>
    );
  }

  if (secao === "historia") {
    const historia = await buscarHistoria(evento.id);
    return (
      <CascaDoEditor {...casca}>
        <EditorDaHistoria
          dados={{
            eventoId: evento.id,
            titulo: historia?.titulo ?? "",
            texto: historia?.texto ?? "",
          }}
        />
      </CascaDoEditor>
    );
  }

  if (secao === "programacao") {
    const momentos = await listarProgramacao(evento.id);
    return (
      <CascaDoEditor {...casca}>
        <EditorDaProgramacao dados={{ eventoId: evento.id, momentos }} />
      </CascaDoEditor>
    );
  }

  if (secao === "perguntas") {
    /**
     * O painel lista **todas**, inclusive as sem resposta — é o contrário do
     * site, que só mostra as respondidas. A diferença é o mecanismo: a pergunta
     * sem resposta existe aqui para ser respondida, e não existe lá.
     */
    const perguntas = await listarPerguntas(evento.id);
    return (
      <CascaDoEditor {...casca}>
        <EditorDasPerguntas dados={{ eventoId: evento.id, perguntas }} />
      </CascaDoEditor>
    );
  }

  const indicacoes = await listarIndicacoesDoPainel(evento.id);
  return (
    <CascaDoEditor {...casca}>
      <EditorDeIndicacoes
        dados={{
          eventoId: evento.id,
          indicacoes: indicacoes.map(i => ({
            id: i.id,
            tipo: i.tipo,
            titulo: i.titulo,
            referencia: i.referencia,
            descricao: i.descricao,
            url: i.url,
            ordem: i.ordem,
          })),
        }}
      />
    </CascaDoEditor>
  );
}
