import { sql, type Executor } from "@/lib/db";
import { hashDeToken } from "@/lib/segredos";
import {
  paraBooleano,
  paraInstante,
  paraTexto,
  paraTextoObrigatorio,
} from "@/lib/serializar-linha";

/**
 * A participação — a identidade do convidado.
 *
 * A IDENTIDADE É O TOKEN, NUNCA O NOME (RN-01). Uma linha por aparelho, por
 * evento. O nome é um rótulo pendurado nela: editável, opcional, e chave de
 * coisa nenhuma. **Nenhuma consulta deste arquivo agrupa por rótulo, filtra por
 * rótulo ou junta por rótulo** — dois "Tio Carlos" existem em toda festa, e um
 * produto que usa o nome como chave junta os álbuns dos dois.
 *
 * Todas as funções aceitam o executor por parâmetro, como em `lib/eventos.ts`:
 * é o que permite a `test/vazamento-inquilinos.test.ts` rodar com dois eventos
 * e sem banco.
 */

export type PapelDeParticipacao = "convidado" | "casal" | "moderador";
export type ModoDeIdentificacao = "lista" | "avulso" | "retomado";

export type Participacao = {
  id: string;
  eventoId: string;
  papel: PapelDeParticipacao;
  convidadoId: string | null;
  rotulo: string | null;
  modoIdentificacao: ModoDeIdentificacao | null;
  faixaLenta: boolean;
  primeiroAcessoEm: Date | null;
};

function paraPapel(valor: unknown): PapelDeParticipacao {
  return valor === "casal" || valor === "moderador" ? valor : "convidado";
}

function paraModo(valor: unknown): ModoDeIdentificacao | null {
  return valor === "lista" || valor === "avulso" || valor === "retomado" ? valor : null;
}

function linhaParaParticipacao(linha: Record<string, unknown>): Participacao {
  return {
    id: paraTextoObrigatorio(linha.id, "participacoes.id"),
    eventoId: paraTextoObrigatorio(linha.evento_id, "participacoes.evento_id"),
    papel: paraPapel(linha.papel),
    convidadoId: paraTexto(linha.convidado_id),
    rotulo: paraTexto(linha.rotulo),
    modoIdentificacao: paraModo(linha.modo_identificacao),
    faixaLenta: paraBooleano(linha.faixa_lenta),
    primeiroAcessoEm: paraInstante(linha.primeiro_acesso_em),
  };
}

/**
 * A participação deste aparelho NESTE evento.
 *
 * O `evento_id` entra na cláusula, e não é redundância com o índice único do
 * token: é o filtro de inquilino (RN-25). Um token de outro casamento tem que
 * devolver nada, não devolver a linha do outro casamento — e é isto que
 * `test/vazamento-inquilinos.test.ts` observa.
 */
export async function participacaoPorToken(
  eventoId: string,
  token: string,
  exec: Executor = sql
): Promise<Participacao | null> {
  const hash = await hashDeToken(token);
  const linhas = await exec`
    select *
      from participacoes
     where token_hash = ${hash}
       and evento_id = ${eventoId}
       and excluido_em is null
     limit 1
  `;
  return linhas.length ? linhaParaParticipacao(linhas[0]) : null;
}

/**
 * Cria a participação, ou reencontra a que já existe, e carimba o acesso.
 *
 * `on conflict` e não "consulta, e se não achar insere": duas abas abertas ao
 * mesmo tempo — que é o caso normal de quem toca no QR duas vezes — mandariam
 * dois `insert` simultâneos, e o segundo estouraria violação de unicidade. O
 * banco decide, e a rota nunca vê o conflito.
 *
 * `ultimo_acesso_em` é atualizado no mesmo comando. Ele é o que permite ao
 * painel do dia dizer quantos aparelhos estão vivos sem uma segunda escrita por
 * abertura de página.
 */
export async function garantirParticipacao(
  eventoId: string,
  token: string,
  papel: PapelDeParticipacao = "convidado",
  exec: Executor = sql
): Promise<Participacao> {
  const hash = await hashDeToken(token);
  const linhas = await exec`
    insert into participacoes (evento_id, token_hash, papel, ultimo_acesso_em)
    values (${eventoId}, ${hash}, ${papel}, now())
    on conflict (token_hash) where excluido_em is null
      do update set ultimo_acesso_em = now(), atualizado_em = now()
    returning *
  `;
  return linhaParaParticipacao(linhas[0]);
}

/**
 * Quantos arquivos esta participação registrou nos últimos N minutos.
 *
 * Serve à decisão da faixa lenta (P11 / RN-11): acima de 50 arquivos em 10
 * minutos a participação é **despriorizada, nunca recusada**. A conta é sobre a
 * intenção (`criada_em`), e não sobre o que chegou — quem manda 200 fotos num
 * uplink ruim tem zero mídia armazenada e é exatamente quem precisa cair de
 * faixa.
 */
export async function arquivosRecentes(
  participacaoId: string,
  minutos: number,
  exec: Executor = sql
): Promise<number> {
  const linhas = await exec`
    select count(*)::int as total
      from midias
     where participacao_id = ${participacaoId}
       and criada_em > now() - (${minutos} * interval '1 minute')
  `;
  const total = linhas[0]?.total;
  return typeof total === "number" ? total : Number(total ?? 0);
}

export async function marcarFaixaLenta(
  participacaoId: string,
  exec: Executor = sql
): Promise<void> {
  await exec`
    update participacoes
       set faixa_lenta = true, atualizado_em = now()
     where id = ${participacaoId}
       and faixa_lenta = false
  `;
}
