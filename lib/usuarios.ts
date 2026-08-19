import { sql, type Executor } from "@/lib/db";
import { ehDiaPuro } from "@/lib/datas";
import { hashDeToken, novoToken } from "@/lib/segredos";
import { paraInstante, paraTexto, paraTextoObrigatorio } from "@/lib/serializar-linha";
import { ARQUIVOS_DA_RAIZ, SEGMENTOS_RESERVADOS } from "@/lib/rotas";
import { TETOS_DO_EVENTO } from "@/lib/site-evento";

/**
 * A CONTA DO CASAL — cadastro, login e as duas formas de voltar (v1.0, decisão
 * do dono em 19/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O QUE MUDOU, E O QUE NÃO MUDOU.**
 *
 * Mudou a porta: o casal se cadastra com e-mail e senha, e o cadastro **cria o
 * casamento**. Não muda o que existe atrás dela: a sessão continua sendo uma
 * linha de `evento_acessos` com o hash de um token ao portador, que vira cookie
 * `httpOnly`. Login não inventa um segundo mecanismo de sessão — ele cria a
 * mesma linha que o link de e-mail criava. **Toda a autorização, o filtro de
 * inquilino e as catracas continuam valendo sem uma linha de mudança.**
 *
 * **O CADASTRO É UMA INSTRUÇÃO SÓ, E ISSO NÃO É ELEGÂNCIA.** Ele cria três
 * linhas em três tabelas — conta, casamento, acesso —, e o driver HTTP do Neon
 * executa **uma instrução por requisição, sem transação abraçando o arquivo**.
 * Em três instruções, a segunda falhando deixa uma conta sem casamento e a
 * terceira falhando deixa um casamento sem dono: dois estados que nenhuma tela
 * sabe descrever, e que ninguém limpa. Com `with ... insert ... returning`, ou
 * as três nascem, ou nenhuma nasce.
 *
 * **O QUE ESTE ARQUIVO NÃO FAZ:** ele não lê cookie (isso é `lib/sessao.ts`, o
 * único que chama `cookies()`), não decide permissão (isso é a matriz de
 * `lib/autorizacao.ts`) e não manda e-mail (isso é `lib/brevo.ts`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Usuario = {
  id: string;
  email: string;
  senhaHash: string;
  emailVerificadoEm: Date | null;
};

export type TipoDeTokenDeUsuario = "verificacao" | "recuperacao";

/**
 * Os dois links de uso único valem 60 minutos.
 *
 * O convite antigo valia 30, e ali fazia sentido: ele era a **única** porta, e
 * quem perdesse a janela pedia outro na mesma tela. Aqui a porta principal é a
 * senha; estes links consertam exceções (confirmar o endereço, esquecer a
 * senha), e uma hora é o que sobrevive a um e-mail que demora, a um celular sem
 * sinal e a uma pessoa que abre a caixa depois do jantar.
 */
export const VALIDADE_DE_TOKEN_MINUTOS = 60;

function linhaParaUsuario(linha: Record<string, unknown>): Usuario {
  return {
    id: paraTextoObrigatorio(linha.id, "usuarios.id"),
    email: paraTextoObrigatorio(linha.email, "usuarios.email"),
    senhaHash: paraTextoObrigatorio(linha.senha_hash, "usuarios.senha_hash"),
    emailVerificadoEm: paraInstante(linha.email_verificado_em),
  };
}

/* ------------------------------------------------------------------ *
 * O e-mail
 * ------------------------------------------------------------------ */

/**
 * Minúsculas e sem espaço nas pontas — **sempre**, na escrita e na leitura.
 *
 * Sem isto, `Ana@Gmail.com` e `ana@gmail.com` viram duas contas, e a segunda
 * descobre isso na hora de recuperar a senha da primeira. O índice único do
 * banco não resolve sozinho: ele compara byte a byte, e é esta função que faz os
 * bytes serem os mesmos.
 */
export function normalizarEmail(bruto: unknown): string {
  return typeof bruto === "string" ? bruto.trim().toLowerCase() : "";
}

/**
 * O formato do e-mail, e por que a régua é frouxa.
 *
 * Não existe expressão regular correta para e-mail — a especificação aceita
 * coisas que ninguém escreve, e toda regra "rigorosa" que já vi recusa um
 * endereço válido de alguém. O que este produto precisa saber é se dá para
 * mandar um link para ali; quem responde isso de verdade é o servidor de
 * e-mail, e a resposta chega como "não recebi nada".
 */
export function ehEmail(valor: unknown): valor is string {
  const email = normalizarEmail(valor);
  if (email.length < 5 || email.length > 254) return false;
  if (/\s/.test(email)) return false;
  const partes = email.split("@");
  return partes.length === 2 && partes[0].length > 0 && /^[^@]+\.[^@.]{2,}$/.test(partes[1]);
}

/* ------------------------------------------------------------------ *
 * O slug do casamento novo
 * ------------------------------------------------------------------ */

/**
 * O nome do casal vira endereço: "Ana Flávia e Maxwel" → `ana-flavia-e-maxwel`.
 *
 * **O RESULTADO PRECISA SOBREVIVER À ROTA CURTA** (`lib/rotas.ts`): a raiz do
 * produto é o espaço de nomes dos casamentos, e um slug igual a `painel`, `api`
 * ou `favicon.ico` roubaria um caminho da plataforma — em silêncio, e depois de
 * o casal já ter mandado o link para os convidados. Por isso os reservados são
 * conferidos aqui, e não só no teste que varre `app/`.
 */
export function slugDoNomeDoCasal(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // os acentos, agora soltos pelo NFD
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

  // Nome só com emoji, só com pontuação, ou vazio depois da limpeza. `casamento`
  // não é bonito, mas é um endereço que funciona — e o casal troca depois.
  if (base.length < 3) return "casamento";
  return base;
}

function ehSlugProibido(slug: string): boolean {
  return (
    (SEGMENTOS_RESERVADOS as readonly string[]).includes(slug) ||
    (ARQUIVOS_DA_RAIZ as readonly string[]).includes(slug) ||
    slug.startsWith("_") ||
    slug.startsWith(".")
  );
}

/**
 * O primeiro slug livre a partir do nome: `ana-e-max`, `ana-e-max-2`, `-3`…
 *
 * A corrida existe e é assumida: dois cadastros simultâneos com o mesmo nome
 * podem escolher o mesmo sufixo, e o segundo `insert` bate no índice único e
 * falha. O tratamento é a rota tentar de novo — e não um bloqueio de tabela para
 * um evento que acontece quando dois casais com o mesmo nome se cadastram no
 * mesmo segundo.
 */
export async function slugLivre(
  nomeCasal: string,
  exec: Executor = sql,
  tentativa = 0
): Promise<string> {
  const base = slugDoNomeDoCasal(nomeCasal);
  const candidato = tentativa === 0 ? base : `${base}-${tentativa + 1}`;

  if (ehSlugProibido(candidato)) return slugLivre(nomeCasal, exec, tentativa + 1);

  const linhas = await exec`
    select 1 from eventos where slug = ${candidato} and excluido_em is null limit 1
  `;
  if (linhas.length === 0) return candidato;

  // 50 é onde o laço para de ser conserto e vira defeito. Cair no id aleatório é
  // pior endereço e melhor que negar o cadastro.
  if (tentativa > 50) return `${base}-${novoToken().slice(0, 6)}`;
  return slugLivre(nomeCasal, exec, tentativa + 1);
}

/* ------------------------------------------------------------------ *
 * Conferir o formulário de cadastro
 * ------------------------------------------------------------------ */

export type DadosDoCadastro = {
  email: string;
  nomeCasal: string;
  dataEvento: string;
  cidade: string;
  uf: string;
};

export type CampoInvalido = { campo: string; mensagem: string };

/**
 * O cadastro pede **cinco campos, e nem um a mais** — e a lista não é escolha de
 * gosto: `eventos` tem `nome_casal`, `data_evento`, `cidade` e `uf` como
 * `not null`. Um cadastro que pedisse só e-mail e senha teria que inventar
 * valores para os quatro, e o site nasceria anunciando um casamento em branco.
 *
 * O que **não** está aqui, e vai para o painel depois: local, horário, mapa,
 * seções, foto. A régua é "sem isto a linha não nasce", e não "isto seria bom
 * ter no começo" — cada campo a mais numa tela de cadastro é gente que desiste.
 */
export function conferirCadastro(bruto: unknown): {
  dados: DadosDoCadastro | null;
  erros: CampoInvalido[];
} {
  const erros: CampoInvalido[] = [];
  const corpo = (bruto ?? {}) as Record<string, unknown>;

  const email = normalizarEmail(corpo.email);
  if (!ehEmail(email)) erros.push({ campo: "email", mensagem: "Escreva um e-mail válido." });

  const nomeCasal = typeof corpo.nome_casal === "string" ? corpo.nome_casal.trim() : "";
  if (nomeCasal === "") {
    erros.push({ campo: "nome_casal", mensagem: "Escrevam como vocês querem aparecer no site." });
  } else if (nomeCasal.length > TETOS_DO_EVENTO.nomeCasal) {
    erros.push({
      campo: "nome_casal",
      mensagem: `Cabe em ${TETOS_DO_EVENTO.nomeCasal} caracteres, e você escreveu ${nomeCasal.length}.`,
    });
  }

  /**
   * A data viaja como STRING e não passa por `Date` em canto nenhum (RV-10). Em
   * UTC, `new Date("2027-08-22")` lido em São Paulo é dia 21 — e o site
   * anunciaria o casamento um dia antes.
   */
  const dataEvento = typeof corpo.data_evento === "string" ? corpo.data_evento.trim() : "";
  if (!ehDiaPuro(dataEvento)) {
    erros.push({ campo: "data_evento", mensagem: "A data vai no formato dia/mês/ano." });
  }

  const cidade = typeof corpo.cidade === "string" ? corpo.cidade.trim() : "";
  if (cidade === "") {
    erros.push({ campo: "cidade", mensagem: "Escreva a cidade do casamento." });
  } else if (cidade.length > TETOS_DO_EVENTO.cidade) {
    erros.push({ campo: "cidade", mensagem: `Cabe em ${TETOS_DO_EVENTO.cidade} caracteres.` });
  }

  const uf = typeof corpo.uf === "string" ? corpo.uf.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(uf)) {
    erros.push({ campo: "uf", mensagem: "O estado vai em duas letras (ex.: RJ)." });
  }

  if (erros.length > 0) return { dados: null, erros };
  return { dados: { email, nomeCasal, dataEvento, cidade, uf }, erros: [] };
}

/* ------------------------------------------------------------------ *
 * Criar a conta e o casamento — uma instrução
 * ------------------------------------------------------------------ */

export type ContaCriada = {
  usuarioId: string;
  eventoId: string;
  slug: string;
  /** O token da sessão, em claro. É a única vez em que ele existe. */
  token: string;
};

/**
 * Conta + casamento + acesso, numa instrução só. Ver o cabeçalho do arquivo.
 *
 * **O CASAMENTO NASCE FORA DO AR** (`publicado = false`), e isto é a decisão mais
 * importante desta função. O casal acabou de escrever quatro campos; o site
 * ainda não tem história, nem programação, nem foto. Nascer publicado
 * significaria que existe, desde o primeiro segundo, um endereço público
 * anunciando um casamento em branco — e o casal descobriria isso quando alguém
 * abrisse. Publicar é um toque no painel (V-11), e ele existe para ser dado
 * quando o casal decidir.
 *
 * **Nenhuma linha em `evento_secoes`**: linha ausente significa o padrão do
 * catálogo (`lib/secoes.ts`), e o site já renderiza certo sem que ninguém toque
 * no painel.
 */
export async function criarContaComCasamento(
  dados: DadosDoCadastro,
  senhaHash: string,
  exec: Executor = sql
): Promise<ContaCriada> {
  const slug = await slugLivre(dados.nomeCasal, exec);
  const token = novoToken();
  const tokenHash = await hashDeToken(token);

  const linhas = await exec`
    with conta as (
      insert into usuarios (email, senha_hash)
      values (${dados.email}, ${senhaHash})
      returning id
    ),
    casamento as (
      insert into eventos (
        slug, nome_casal, data_evento, cidade, uf, email_casal, publicado
      )
      values (
        ${slug}, ${dados.nomeCasal}, ${dados.dataEvento}::date,
        ${dados.cidade}, ${dados.uf}, ${dados.email}, false
      )
      returning id
    )
    insert into evento_acessos (evento_id, tipo, token_hash, usuario_id, rotulo)
    select casamento.id, 'casal', ${tokenHash}, conta.id, null
      from conta, casamento
    returning evento_id, usuario_id
  `;

  return {
    usuarioId: paraTextoObrigatorio(linhas[0].usuario_id, "evento_acessos.usuario_id"),
    eventoId: paraTextoObrigatorio(linhas[0].evento_id, "evento_acessos.evento_id"),
    slug,
    token,
  };
}

/* ------------------------------------------------------------------ *
 * Ler a conta
 * ------------------------------------------------------------------ */

export async function usuarioPorEmail(
  email: string,
  exec: Executor = sql
): Promise<Usuario | null> {
  const linhas = await exec`
    select id, email, senha_hash, email_verificado_em
      from usuarios
     where email = ${normalizarEmail(email)}
       and excluido_em is null
     limit 1
  `;
  return linhas.length ? linhaParaUsuario(linhas[0]) : null;
}

export async function usuarioPorId(id: string, exec: Executor = sql): Promise<Usuario | null> {
  const linhas = await exec`
    select id, email, senha_hash, email_verificado_em
      from usuarios
     where id = ${id}
       and excluido_em is null
     limit 1
  `;
  return linhas.length ? linhaParaUsuario(linhas[0]) : null;
}

/**
 * O casamento desta conta.
 *
 * **A CONSULTA NÃO FILTRA `revogado_em`, e a ausência é a funcionalidade**: o
 * vínculo entre a conta e o casamento sobrevive à revogação de uma sessão. Quem
 * apertou "sair" em todos os aparelhos não deixou de ser dono do próprio
 * casamento — com o filtro, ele entraria de novo e o produto diria que ele não
 * tem casamento nenhum.
 *
 * O mais antigo, e não o mais novo: uma conta tem um casamento nesta versão, e
 * se um dia tiver dois, o primeiro é o que ela abriu primeiro.
 */
export async function eventoDoUsuario(
  usuarioId: string,
  exec: Executor = sql
): Promise<string | null> {
  const linhas = await exec`
    select evento_id
      from evento_acessos
     where usuario_id = ${usuarioId}
       and tipo = 'casal'
     order by criado_em asc
     limit 1
  `;
  return linhas.length ? paraTexto(linhas[0].evento_id) : null;
}

/* ------------------------------------------------------------------ *
 * Entrar: uma sessão nova por aparelho
 * ------------------------------------------------------------------ */

/**
 * Cria a sessão do login e devolve o token em claro.
 *
 * **UMA LINHA NOVA POR ENTRADA, e não a rotação de um token só** — a mesma
 * decisão que o convite tomava. O casal são duas pessoas em dois celulares, e um
 * token único faria a segunda entrada derrubar a primeira: o marido entra, a
 * noiva entra, e o marido volta para a tela de senha sem entender por quê.
 * Linhas separadas também é o que permite revogar um aparelho perdido sem
 * derrubar o outro.
 */
export async function abrirSessao(
  eventoId: string,
  usuarioId: string,
  exec: Executor = sql
): Promise<string> {
  const token = novoToken();
  const hash = await hashDeToken(token);
  await exec`
    insert into evento_acessos (evento_id, tipo, token_hash, usuario_id)
    values (${eventoId}, 'casal', ${hash}, ${usuarioId})
  `;
  await exec`
    update usuarios set ultimo_acesso_em = now(), atualizado_em = now()
     where id = ${usuarioId}
  `;
  return token;
}

/**
 * Derruba **todas** as sessões desta conta.
 *
 * Chamada quando a senha é redefinida, e é obrigatória: quem redefiniu a senha
 * porque desconfia que alguém entrou não ganha nada se o cookie do intruso
 * continuar valendo por trinta dias. É a diferença entre trocar a fechadura e
 * pedir educadamente que devolvam a chave.
 */
export async function revogarSessoesDoUsuario(
  usuarioId: string,
  exec: Executor = sql
): Promise<number> {
  const linhas = await exec`
    update evento_acessos
       set revogado_em = now(), atualizado_em = now()
     where usuario_id = ${usuarioId}
       and revogado_em is null
    returning id
  `;
  return linhas.length;
}

export async function trocarSenha(
  usuarioId: string,
  senhaHash: string,
  exec: Executor = sql
): Promise<void> {
  await exec`
    update usuarios
       set senha_hash = ${senhaHash},
           atualizado_em = now()
     where id = ${usuarioId}
  `;
}

/* ------------------------------------------------------------------ *
 * Os links de uso único
 * ------------------------------------------------------------------ */

export async function criarTokenDeUsuario(
  usuarioId: string,
  tipo: TipoDeTokenDeUsuario,
  exec: Executor = sql
): Promise<string> {
  const token = novoToken();
  const hash = await hashDeToken(token);
  await exec`
    insert into usuario_tokens (usuario_id, tipo, token_hash, expira_em)
    values (
      ${usuarioId}, ${tipo}, ${hash},
      now() + (${VALIDADE_DE_TOKEN_MINUTOS} * interval '1 minute')
    )
  `;
  return token;
}

/**
 * Troca o token pelo id da conta. Uma vez só, e a corrida é do banco.
 *
 * O `update ... where usado_em is null returning` é o que torna o consumo
 * atômico — o mesmo padrão do convite antigo, e pelo mesmo motivo real: o
 * verificador de links do cliente de e-mail abre o link antes da pessoa. Se isto
 * fosse "consulta, confere, marca", os dois passariam.
 *
 * Devolve `null` quando o token não existe, expirou, já foi usado **ou é de
 * outro tipo**. Os quatro casos são a mesma tela, de propósito: distinguir "não
 * existe" de "já usado" só informa quem está adivinhando token.
 */
export async function consumirTokenDeUsuario(
  token: string,
  tipo: TipoDeTokenDeUsuario,
  exec: Executor = sql
): Promise<string | null> {
  const hash = await hashDeToken(token);
  const linhas = await exec`
    update usuario_tokens
       set usado_em = now()
     where token_hash = ${hash}
       and tipo = ${tipo}
       and usado_em is null
       and expira_em > now()
    returning usuario_id
  `;
  return linhas.length ? paraTexto(linhas[0].usuario_id) : null;
}

export async function marcarEmailVerificado(
  usuarioId: string,
  exec: Executor = sql
): Promise<void> {
  await exec`
    update usuarios
       set email_verificado_em = coalesce(email_verificado_em, now()),
           atualizado_em = now()
     where id = ${usuarioId}
  `;
}
