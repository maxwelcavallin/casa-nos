import { sql, type Executor } from "@/lib/db";
import {
  hashDeToken,
  novoToken,
  VALIDADE_CONVITE_MINUTOS,
} from "@/lib/segredos";
import {
  paraBooleano,
  paraInstante,
  paraTexto,
  paraTextoObrigatorio,
} from "@/lib/serializar-linha";

/**
 * Casal, moderador e telão — os três portadores que não são o convidado.
 *
 * UMA TABELA, TRÊS TIPOS (PRD §3.2, P1). Nascendo em três lugares, viram três
 * implementações de "ler o token e decidir o que pode", que é o `if` espalhado
 * que `stack.md` §3 proíbe.
 *
 * O TOKEN EM CLARO EXISTE UMA VEZ SÓ: no instante em que é gerado, para ser
 * mandado a quem vai usá-lo. Depois disso só existe o hash. `criarAcesso`
 * devolve o token; nenhuma outra função deste arquivo consegue recuperá-lo, e
 * isso é a funcionalidade, não uma limitação.
 */

export type TipoDeAcesso = "casal" | "moderador" | "telao";

export type Acesso = {
  id: string;
  eventoId: string;
  tipo: TipoDeAcesso;
  rotulo: string | null;
  /** O acesso do DONO do produto, que enxerga a medição (PRD §7). */
  dono: boolean;
  expiraEm: Date | null;
};

function paraTipo(valor: unknown): TipoDeAcesso {
  return valor === "casal" || valor === "moderador" || valor === "telao"
    ? valor
    : "telao";
}

function linhaParaAcesso(linha: Record<string, unknown>): Acesso {
  return {
    id: paraTextoObrigatorio(linha.id, "evento_acessos.id"),
    eventoId: paraTextoObrigatorio(linha.evento_id, "evento_acessos.evento_id"),
    tipo: paraTipo(linha.tipo),
    rotulo: paraTexto(linha.rotulo),
    dono: paraBooleano(linha.dono),
    expiraEm: paraInstante(linha.expira_em),
  };
}

/**
 * O acesso deste token NESTE evento.
 *
 * Três condições, e nenhuma delas é dispensável:
 * - `evento_id` — filtro de inquilino (RN-25). Sem ele, o token do moderador de
 *   um casamento abriria o painel do outro.
 * - `revogado_em is null` — revogar precisa derrubar na sondagem seguinte
 *   (H-02), e não "quando o cookie expirar".
 * - `expira_em` — nulo significa "não expira", que é o caso do telão e do
 *   moderador. O `coalesce` é o que impede um nulo de virar falso.
 */
export async function acessoPorToken(
  eventoId: string,
  token: string,
  exec: Executor = sql
): Promise<Acesso | null> {
  const hash = await hashDeToken(token);
  const linhas = await exec`
    select *
      from evento_acessos
     where token_hash = ${hash}
       and evento_id = ${eventoId}
       and revogado_em is null
       and (expira_em is null or expira_em > now())
     limit 1
  `;
  return linhas.length ? linhaParaAcesso(linhas[0]) : null;
}

/**
 * O acesso de TELÃO deste token, sem saber de qual evento ele é (H-12).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELA É A ÚNICA CONSULTA DO PRODUTO QUE PROCURA UM TOKEN SEM FILTRO DE
 * INQUILINO, e a exceção precisa estar escrita, porque ela contraria a RN-25.
 *
 * O motivo é a forma da rota: `/telao/[token]` **não tem evento na URL**. O
 * computador ligado ao projetor recebe um link e mais nada — não há cookie, não
 * há domínio próprio, não há sessão anterior. O token É o endereço.
 *
 * O QUE MANTÉM A REGRA DE PÉ apesar disso: o `evento_id` sai **desta linha**, e
 * não de nada que o cliente mande. A partir daqui todo o resto do produto volta
 * a filtrar por ele. Além disso o filtro `tipo = 'telao'` é obrigatório na
 * cláusula: sem ele, o token de um moderador aberto nesta rota viraria uma
 * sessão de telão, e o telão é a superfície sem interação nenhuma — o downgrade
 * pareceria inofensivo e daria a um moderador uma tela que ele não deveria abrir
 * assim.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function acessoDeTelaoPorToken(
  token: string,
  exec: Executor = sql
): Promise<Acesso | null> {
  const hash = await hashDeToken(token);
  const linhas = await exec`
    select *
      from evento_acessos
     where token_hash = ${hash}
       and tipo = 'telao'
       and revogado_em is null
       and (expira_em is null or expira_em > now())
     limit 1
  `;
  return linhas.length ? linhaParaAcesso(linhas[0]) : null;
}

export async function listarAcessos(
  eventoId: string,
  tipo: TipoDeAcesso | null = null,
  exec: Executor = sql
): Promise<Acesso[]> {
  const linhas = tipo
    ? await exec`
        select * from evento_acessos
         where evento_id = ${eventoId} and tipo = ${tipo} and revogado_em is null
         order by criado_em asc
      `
    : await exec`
        select * from evento_acessos
         where evento_id = ${eventoId} and revogado_em is null
         order by tipo asc, criado_em asc
      `;
  return linhas.map(linhaParaAcesso);
}

/**
 * Cria um acesso e devolve o token em claro — a única vez em que ele existe.
 *
 * IDEMPOTÊNCIA POR RÓTULO, e ela é da H-02: "dois toques no botão de salvar não
 * geram dois moderadores nem dois links". A chave natural aqui é
 * (evento, tipo, rótulo), porque é ela que a pessoa vê na tela. Quando o rótulo
 * já existe, devolvemos o acesso existente **sem token** — quem já tem o link
 * continua com ele, e a tela mostra "copiar" em vez de um link novo.
 */
export async function criarAcesso(
  eventoId: string,
  tipo: TipoDeAcesso,
  rotulo: string | null,
  exec: Executor = sql,
  dono = false
): Promise<{ acesso: Acesso; token: string | null }> {
  if (rotulo) {
    const existentes = await exec`
      select * from evento_acessos
       where evento_id = ${eventoId}
         and tipo = ${tipo}
         and rotulo = ${rotulo}
         and revogado_em is null
       limit 1
    `;
    if (existentes.length) {
      return { acesso: linhaParaAcesso(existentes[0]), token: null };
    }
  }

  const token = novoToken();
  const hash = await hashDeToken(token);
  const linhas = await exec`
    insert into evento_acessos (evento_id, tipo, token_hash, rotulo, dono)
    values (${eventoId}, ${tipo}, ${hash}, ${rotulo}, ${dono})
    returning *
  `;
  return { acesso: linhaParaAcesso(linhas[0]), token };
}

/**
 * Revoga. Nunca apaga.
 *
 * A linha fica, com `revogado_em` preenchido: quem revogou um link de telão às
 * 23h precisa poder ver, no dia seguinte, que ele existiu e quando morreu. E o
 * índice único de token é parcial (`where revogado_em is null`), então um token
 * revogado não bloqueia a criação de outro.
 *
 * Devolve quantas linhas mudaram, para a rota distinguir 204 de 404 — o acesso
 * de outro evento **não existe** para esta sessão, e a resposta é 404.
 */
export async function revogarAcesso(
  eventoId: string,
  acessoId: string,
  exec: Executor = sql
): Promise<number> {
  const linhas = await exec`
    update evento_acessos
       set revogado_em = now(), atualizado_em = now()
     where id = ${acessoId}
       and evento_id = ${eventoId}
       and revogado_em is null
    returning id
  `;
  return linhas.length;
}

/**
 * "Este acesso deu sinal de vida agora."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELE É O ÚNICO JEITO DE ALGUÉM DESCOBRIR QUE O TELÃO CONGELOU (H-12).
 *
 * A tela do telão **não pode** contar que algo deu errado: erro projetado num
 * casamento é incidente, não estado. A consequência é dura e está escrita no
 * desenho: **o telão quebrado e o telão funcionando são visualmente
 * indistinguíveis da pista de dança.**
 *
 * Então a evidência mora aqui. O telão carimba este campo a cada sondagem
 * bem-sucedida, e a distância entre `ultimo_uso_em` e agora é a resposta para
 * "o telão ainda está falando com a gente?" — uma pergunta que se faz no painel
 * (H-19, F1.6), na tela do dono, e nunca na parede.
 *
 * O CARIMBO É LIMITADO A UM POR MINUTO, na própria cláusula. Sem isso, uma
 * sondagem de 5 s por 6 horas seriam 4.320 escritas numa linha só, e a coluna
 * que existe para diagnóstico viraria a escrita mais quente da festa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function carimbarUso(
  acessoId: string,
  exec: Executor = sql
): Promise<void> {
  await exec`
    update evento_acessos
       set ultimo_uso_em = now()
     where id = ${acessoId}
       and (ultimo_uso_em is null or ultimo_uso_em < now() - interval '1 minute')
  `;
}

/* ------------------------------------------------------------------ *
 * O convite: 30 minutos, uma vez só
 * ------------------------------------------------------------------ */

/**
 * O link que o casal recebe por e-mail.
 *
 * TABELA SEPARADA porque o ciclo de vida é outro: este morre no primeiro uso,
 * aquele dura 30 dias. Misturar os dois obrigaria a coluna `usado_em` a existir
 * no acesso permanente, onde ela não significa nada — e um dia alguém marcaria
 * o acesso do telão como usado.
 */
export async function criarConvite(
  eventoId: string,
  exec: Executor = sql
): Promise<string> {
  const token = novoToken();
  const hash = await hashDeToken(token);
  await exec`
    insert into evento_acessos_convites (evento_id, token_hash, expira_em)
    values (${eventoId}, ${hash}, now() + (${VALIDADE_CONVITE_MINUTOS} * interval '1 minute'))
  `;
  return token;
}

/**
 * Troca o convite por um acesso de casal. Uma vez só, e a corrida é do banco.
 *
 * O `update ... where usado_em is null returning` é o que torna o consumo
 * atômico: dois cliques no mesmo link — o do e-mail e o da pré-visualização do
 * cliente de e-mail, que é o caso real — chegam juntos, e só um volta com linha.
 * Se isto fosse "consulta, confere, marca", os dois passariam.
 *
 * Devolve `null` quando o convite não existe, expirou ou já foi usado. Os três
 * casos são a MESMA tela ("este link expirou" + botão que manda outro), de
 * propósito: distinguir "não existe" de "já foi usado" só informa quem está
 * tentando adivinhar token.
 */
export async function consumirConvite(
  token: string,
  exec: Executor = sql
): Promise<{ eventoId: string; token: string } | null> {
  const hash = await hashDeToken(token);
  const linhas = await exec`
    update evento_acessos_convites
       set usado_em = now()
     where token_hash = ${hash}
       and usado_em is null
       and expira_em > now()
    returning evento_id
  `;
  if (!linhas.length) return null;

  const eventoId = paraTextoObrigatorio(
    linhas[0].evento_id,
    "evento_acessos_convites.evento_id"
  );

  /**
   * UMA LINHA NOVA POR APARELHO, e não a rotação do token existente.
   *
   * Rotacionar seria a escolha óbvia — o casal é UM ator nesta fatia (P1), então
   * "um token" parece certo. Mas são duas pessoas com dois celulares: a noiva
   * pede o link no domingo, o noivo pede na terça, e com rotação o pedido dele
   * derrubaria a sessão dela sem nenhum aviso e sem nenhum motivo que ela
   * pudesse entender. Uma linha por aparelho custa uma linha; revogar qualquer
   * uma continua sendo uma ação da tela do dia.
   *
   * O `dono` NÃO é herdado aqui de propósito: ele é marcado no bootstrap, uma
   * vez, e um link de e-mail nunca promove ninguém a dono.
   */
  /**
   * O `dono` É HERDADO DO EVENTO, e não do convite.
   *
   * No casamento cobaia o dono do produto **é** o casal (PRD §5.2: por isso
   * `dono` é um booleano e não um quarto tipo de acesso). O bootstrap marca o
   * evento cobaia; qualquer link de entrada daquele evento abre com a visão do
   * dono, e o segundo evento — o do teste de vazamento — nunca abre, porque lá
   * nada foi marcado.
   *
   * A alternativa seria uma coluna no convite, e ela não existe: a migration
   * 0003 está escrita e migration aplicada é imutável. Mais importante, ela
   * criaria uma forma de promover alguém a dono por e-mail, que é exatamente o
   * que não se quer.
   */
  const marcados = await exec`
    select 1 from evento_acessos
     where evento_id = ${eventoId} and tipo = 'casal' and dono = true and revogado_em is null
     limit 1
  `;
  const ehDono = marcados.length > 0;

  const novo = novoToken();
  const novoHash = await hashDeToken(novo);
  await exec`
    insert into evento_acessos (evento_id, tipo, token_hash, rotulo, dono, ultimo_uso_em)
    values (${eventoId}, 'casal', ${novoHash}, 'Casal', ${ehDono}, now())
  `;

  return { eventoId, token: novo };
}

/**
 * O evento de um convite, mesmo que ele já tenha expirado ou sido usado.
 *
 * EXISTE POR CAUSA DA TELA "este link expirou" (H-02): ela tem um botão que
 * manda outro link, e mandar exige saber para onde. Pedir o e-mail ali seria um
 * campo a mais numa tela cuja única função é consertar um erro nosso — e o
 * produto já sabe o endereço, porque ele está no evento.
 *
 * Não devolve nada além do id do evento: o token expirado não vira credencial
 * de coisa nenhuma, e quem chama só consegue disparar um e-mail para um endereço
 * que ele não escolhe e não lê.
 */
export async function eventoDoConvite(
  token: string,
  exec: Executor = sql
): Promise<string | null> {
  const hash = await hashDeToken(token);
  const linhas = await exec`
    select evento_id from evento_acessos_convites where token_hash = ${hash} limit 1
  `;
  return linhas.length
    ? paraTextoObrigatorio(linhas[0].evento_id, "evento_acessos_convites.evento_id")
    : null;
}

/**
 * `maxwel@exemplo.com.br` → `ma****@exemplo.com.br`.
 *
 * A tela confirma para onde o link foi sem escrever o endereço inteiro: quem
 * está com o celular do casal na mão vê o suficiente para reconhecer, e um
 * ombro por perto não leva o e-mail embora.
 */
export function emailMascarado(email: string | null): string {
  if (!email || !email.includes("@")) return "";
  const [usuario, dominio] = email.split("@");
  const visivel = usuario.slice(0, 2);
  return `${visivel}${"*".repeat(Math.max(1, usuario.length - 2))}@${dominio}`;
}
