import {
  buscarHistoria,
  listarPerguntas,
  listarProgramacao,
  perguntasRespondidas,
  type Historia,
  type Momento,
  type Pergunta,
} from "@/lib/conteudo-do-site";
import { agoraNoServidor } from "@/lib/datas";
import { sql, type Executor } from "@/lib/db";
import {
  listarIndicacoes,
  recortePublico,
  type Evento,
  type EventoPublico,
  type Indicacao,
} from "@/lib/eventos";
import { chavesLigadas, listarSecoes, type ChaveDeSecao } from "@/lib/secoes";

/**
 * O SITE QUE O CONVIDADO VÊ, MONTADO NUM LUGAR SÓ (v1.0, V-10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA FUNÇÃO EXISTE, e por que ela nasceu junto com a prévia:
 *
 * Até a V-10 este bloco estava escrito **duas vezes** — em `app/page.tsx` (o
 * site pelo domínio) e em `app/e/[slug]/page.tsx` (o site pelo slug). Duas
 * cópias de dez linhas idênticas já eram um risco tolerável, porque as duas
 * telas mostram a mesma coisa para a mesma pessoa.
 *
 * A prévia muda isso. O critério da V-10 é literal: **"o que a prévia esconde, o
 * site esconde; o que ela mostra, o site mostra"** — e uma terceira cópia é
 * exatamente como esse critério deixa de valer sem ninguém perceber. Bastaria,
 * daqui a um ano, alguém acrescentar uma seção nova a duas das três cópias: a
 * prévia mentiria, o casal aprovaria o que viu, e o convidado veria outra coisa.
 *
 * Com uma função só, a prévia não pode divergir do site — ela não tem onde.
 * `test/previa.test.ts` varre as três telas e falha se alguma parar de chamar
 * daqui.
 *
 * **O CONTEÚDO DE SEÇÃO DESLIGADA NÃO É NEM BUSCADO** (RV-01). Não é economia de
 * consulta: é o que faz o texto não existir no HTML. Esconder na renderização
 * deixaria o conteúdo no código-fonte da página, e o primeiro convidado curioso
 * leria o que o casal decidiu não contar. **A prévia herda isso de graça** — e é
 * bom que herde, porque o casal precisa ver o site que o convidado recebe,
 * inclusive no que ele não recebe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DadosDoSite = {
  evento: EventoPublico;
  indicacoes: Indicacao[];
  agoraMs: number;
  /** As chaves LIGADAS, já na ordem do casal. */
  secoes: readonly ChaveDeSecao[];
  historia: Historia | null;
  programacao: Momento[];
  /** **Já filtradas**: pergunta sem resposta não chega ao componente (RV-02). */
  perguntas: Pergunta[];
};

/**
 * Recebe o evento **já resolvido**, e não um slug nem um id.
 *
 * A diferença é o que separa as três telas: `/` resolve por domínio, `/e/[slug]`
 * resolve por slug e exige `publicado = true`, e a prévia resolve por id e
 * **não** exige publicação. Quem decide QUAL evento é a tela; o que este arquivo
 * decide é como ele aparece — e essa parte precisa ser a mesma nas três.
 */
export async function montarSite(
  evento: Evento,
  exec: Executor = sql
): Promise<DadosDoSite> {
  const secoes = await listarSecoes(evento.id, exec);
  const ligadas = chavesLigadas(secoes);

  const [indicacoes, historia, programacao, perguntas] = await Promise.all([
    ligadas.includes("indicacoes") ? listarIndicacoes(evento.id, exec) : [],
    ligadas.includes("historia") ? buscarHistoria(evento.id, exec) : null,
    ligadas.includes("programacao") ? listarProgramacao(evento.id, exec) : [],
    ligadas.includes("perguntas")
      ? listarPerguntas(evento.id, exec).then(perguntasRespondidas)
      : [],
  ]);

  return {
    evento: recortePublico(evento),
    indicacoes,
    // O "agora" do servidor vai junto para a primeira pintura do cliente ser
    // idêntica à do servidor. Ver o comentário em ContagemRegressiva.
    agoraMs: agoraNoServidor().getTime(),
    secoes: ligadas,
    historia,
    programacao,
    perguntas,
  };
}
