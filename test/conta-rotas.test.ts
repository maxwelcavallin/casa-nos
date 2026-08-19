import { beforeEach, describe, expect, it, vi } from "vitest";

import { zerarLimites } from "@/lib/limite-taxa";
import { hashDeSenha } from "@/lib/senhas";

/**
 * AS ROTAS DA CONTA (19/08/2026) — cadastrar, entrar, trocar a senha, sair.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **AS QUATRO PROMESSAS QUE ESTE ARQUIVO SEGURA, e nenhuma delas é visível numa
 * revisão de código apressada:**
 *
 * 1. **O cadastro é UMA instrução.** Conta, casamento e acesso nascem juntos ou
 *    não nascem. Em três instruções — que é como qualquer um escreveria —, a
 *    segunda falhando deixa uma conta sem casamento, e a terceira deixa um
 *    casamento sem dono. O driver HTTP do Neon não abraça três `insert` numa
 *    transação, então isto não é preciosismo: é a única forma.
 *
 * 2. **O casamento nasce FORA DO AR.** Nascer publicado significaria um endereço
 *    público anunciando um casamento em branco desde o primeiro segundo.
 *
 * 3. **E-mail desconhecido e senha errada dão a MESMA resposta.** Sem isso, a
 *    tela de login vira um verificador de endereços.
 *
 * 4. **Trocar a senha derruba todas as sessões.** Quem troca a senha porque
 *    desconfia que alguém entrou não ganha nada se o cookie do intruso continuar
 *    valendo trinta dias.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";

type Instrucao = { texto: string; valores: unknown[] };

const banco = {
  instrucoes: [] as Instrucao[],
  /** A conta que `usuarioPorEmail` devolve, ou `null` para "não existe". */
  usuario: null as { id: string; email: string; senha_hash: string } | null,
  /** O que `eventoDoUsuario` responde. */
  eventoDoUsuario: EVENTO as string | null,
  /** O que `consumirTokenDeUsuario` responde. */
  tokenValido: true,
  /** Já existe casamento com o slug candidato? */
  slugOcupado: false,
};

const execFalso = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
  const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
  banco.instrucoes.push({ texto, valores });

  if (/select 1 from eventos where slug/.test(texto)) {
    return banco.slugOcupado ? [{ "?column?": 1 }] : [];
  }
  if (/from usuarios/.test(texto) && /select id, email, senha_hash/.test(texto)) {
    return banco.usuario ? [{ ...banco.usuario, email_verificado_em: null }] : [];
  }
  if (/insert into usuarios/.test(texto) && /with conta as/.test(texto)) {
    return [{ evento_id: EVENTO, usuario_id: USUARIO }];
  }
  if (/select evento_id from evento_acessos/.test(texto)) {
    return banco.eventoDoUsuario ? [{ evento_id: banco.eventoDoUsuario }] : [];
  }
  if (/update usuario_tokens/.test(texto)) {
    return banco.tokenValido ? [{ usuario_id: USUARIO }] : [];
  }
  if (/update evento_acessos set revogado_em/.test(texto)) {
    return [{ id: "sessao-1" }, { id: "sessao-2" }];
  }
  return [];
}) as unknown as never;

vi.mock("@/lib/db", () => ({
  // A fábrica é içada: ela só pode CHAMAR `execFalso`, nunca citá-lo.
  sql: (...argumentos: unknown[]) =>
    (execFalso as unknown as (...a: unknown[]) => unknown)(...argumentos),
}));

const emails: { para: string; texto: string }[] = [];
vi.mock("@/lib/brevo", () => ({
  enviarEmail: async (mensagem: { para: string; texto: string }) => {
    emails.push(mensagem);
    return true;
  },
}));

vi.mock("@/lib/observabilidade", () => ({
  registrarErro: async () => {},
  sanearMensagem: (v: unknown) => String(v),
}));

const contexto = { params: Promise.resolve({}) };

function pedido(corpo: unknown): Request {
  return new Request("https://casa-nos.invalid/api/sessao", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify(corpo),
  });
}

const CADASTRO = {
  email: "ana@exemplo.com.br",
  senha: "uma frase que a gente lembra",
  nome_casal: "Ana Flávia e Maxwel",
  data_evento: "2027-08-22",
  cidade: "Rio de Janeiro",
  uf: "RJ",
};

beforeEach(() => {
  zerarLimites();
  banco.instrucoes = [];
  banco.usuario = null;
  banco.eventoDoUsuario = EVENTO;
  banco.tokenValido = true;
  banco.slugOcupado = false;
  emails.length = 0;
});

describe("cadastrar", () => {
  it("**cria conta, casamento e acesso numa instrução só**", async () => {
    const { POST } = await import("@/app/api/sessao/cadastrar/route");
    const resposta = await POST(pedido(CADASTRO), contexto);

    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toMatchObject({ evento_id: EVENTO });

    const escritas = banco.instrucoes.filter(i => /^with conta as/.test(i.texto));
    expect(escritas).toHaveLength(1);
    expect(escritas[0].texto).toMatch(/insert into usuarios/);
    expect(escritas[0].texto).toMatch(/insert into eventos/);
    expect(escritas[0].texto).toMatch(/insert into evento_acessos/);
  });

  it("**o casamento nasce fora do ar**", async () => {
    const { POST } = await import("@/app/api/sessao/cadastrar/route");
    await POST(pedido(CADASTRO), contexto);

    const escrita = banco.instrucoes.find(i => /^with conta as/.test(i.texto));
    /**
     * O `false` é literal na instrução, e não parâmetro: é uma decisão do
     * produto, e não um valor que alguém possa passar de fora. Um cadastro que
     * aceitasse `publicado: true` no corpo poria no ar um casamento em branco.
     */
    expect(escrita?.texto).toMatch(/publicado[\s\S]*false/);
  });

  it("a senha nunca viaja para o banco — só o hash", async () => {
    const { POST } = await import("@/app/api/sessao/cadastrar/route");
    await POST(pedido(CADASTRO), contexto);

    const tudo = JSON.stringify(banco.instrucoes);
    expect(tudo).not.toContain(CADASTRO.senha);
    expect(tudo).toContain("pbkdf2-sha256$");
  });

  it("e-mail já cadastrado responde 409 e manda para o login", async () => {
    banco.usuario = { id: USUARIO, email: CADASTRO.email, senha_hash: "x" };
    const { POST } = await import("@/app/api/sessao/cadastrar/route");
    const resposta = await POST(pedido(CADASTRO), contexto);

    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { detalhe: { campos: { mensagem: string }[] } };
    expect(corpo.detalhe.campos[0].mensagem).toMatch(/Entre com ele/);
    expect(banco.instrucoes.some(i => /with conta as/.test(i.texto))).toBe(false);
  });

  it("senha curta reprova antes de tocar no banco, e o erro é do campo", async () => {
    const { POST } = await import("@/app/api/sessao/cadastrar/route");
    const resposta = await POST(pedido({ ...CADASTRO, senha: "curta" }), contexto);

    expect(resposta.status).toBe(400);
    const corpo = (await resposta.json()) as { detalhe: { campos: { campo: string }[] } };
    expect(corpo.detalhe.campos.map(c => c.campo)).toContain("senha");
    expect(banco.instrucoes).toEqual([]);
  });

  it("o e-mail de confirmação sai, e o link é de uso único", async () => {
    const { POST } = await import("@/app/api/sessao/cadastrar/route");
    await POST(pedido(CADASTRO), contexto);

    expect(emails).toHaveLength(1);
    expect(emails[0].para).toBe(CADASTRO.email);
    expect(emails[0].texto).toMatch(/\/verificar\/[0-9a-f]{64}/);
  });

  it("**a sessão sai no cookie, e o cookie é `httpOnly`**", async () => {
    const { POST } = await import("@/app/api/sessao/cadastrar/route");
    const resposta = await POST(pedido(CADASTRO), contexto);

    const cookie = resposta.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });
});

describe("entrar", () => {
  async function comSenhaGuardada(senha: string) {
    banco.usuario = { id: USUARIO, email: CADASTRO.email, senha_hash: await hashDeSenha(senha) };
  }

  it("entra e devolve o casamento da conta", async () => {
    await comSenhaGuardada(CADASTRO.senha);
    const { POST } = await import("@/app/api/sessao/entrar/route");
    const resposta = await POST(
      pedido({ email: CADASTRO.email, senha: CADASTRO.senha }),
      contexto
    );

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ evento_id: EVENTO });
    expect(resposta.headers.get("set-cookie") ?? "").toMatch(/HttpOnly/i);
    // Uma linha nova por entrada: é o que permite dois celulares ao mesmo tempo.
    expect(banco.instrucoes.some(i => /insert into evento_acessos/.test(i.texto))).toBe(true);
  });

  it("**senha errada e e-mail inexistente dão a MESMA resposta**", async () => {
    const { POST } = await import("@/app/api/sessao/entrar/route");

    await comSenhaGuardada(CADASTRO.senha);
    const comSenhaErrada = await POST(
      pedido({ email: CADASTRO.email, senha: "outra frase qualquer" }),
      contexto
    );

    banco.usuario = null;
    const semConta = await POST(
      pedido({ email: "ninguem@exemplo.com", senha: CADASTRO.senha }),
      contexto
    );

    expect(comSenhaErrada.status).toBe(401);
    expect(semConta.status).toBe(401);
    expect(await comSenhaErrada.json()).toEqual(await semConta.json());
  });

  it("conta sem casamento também responde igual — e não abre sessão", async () => {
    await comSenhaGuardada(CADASTRO.senha);
    banco.eventoDoUsuario = null;
    const { POST } = await import("@/app/api/sessao/entrar/route");
    const resposta = await POST(
      pedido({ email: CADASTRO.email, senha: CADASTRO.senha }),
      contexto
    );

    expect(resposta.status).toBe(401);
    expect(resposta.headers.get("set-cookie")).toBeNull();
  });

  it("o limite de taxa responde 429 depois de dez tentativas", async () => {
    const { POST } = await import("@/app/api/sessao/entrar/route");
    let ultima = 0;
    for (let i = 0; i < 12; i++) {
      ultima = (await POST(pedido({ email: "a@b.com", senha: "x".repeat(12) }), contexto)).status;
    }
    expect(ultima).toBe(429);
  });
});

describe("trocar a senha com o link do e-mail", () => {
  it("**derruba todas as sessões, e abre uma nova para quem trocou**", async () => {
    const { POST } = await import("@/app/api/sessao/senha/route");
    banco.usuario = { id: USUARIO, email: CADASTRO.email, senha_hash: "x" };

    const resposta = await POST(
      pedido({ token: "a".repeat(64), senha: "a senha nova de sempre" }),
      contexto
    );

    expect(resposta.status).toBe(200);
    const textos = banco.instrucoes.map(i => i.texto);
    // A ordem importa: consumir o token, gravar, revogar, abrir.
    const consumo = textos.findIndex(t => /update usuario_tokens/.test(t));
    const gravacao = textos.findIndex(t => /update usuarios set senha_hash/.test(t));
    const revogacao = textos.findIndex(t => /update evento_acessos set revogado_em/.test(t));
    const abertura = textos.findIndex(t => /insert into evento_acessos/.test(t));

    expect(consumo).toBeGreaterThanOrEqual(0);
    expect(gravacao).toBeGreaterThan(consumo);
    expect(revogacao).toBeGreaterThan(gravacao);
    expect(abertura).toBeGreaterThan(revogacao);
  });

  it("token gasto responde 410 — a mesma tela de 'link expirado'", async () => {
    banco.tokenValido = false;
    const { POST } = await import("@/app/api/sessao/senha/route");
    const resposta = await POST(
      pedido({ token: "a".repeat(64), senha: "a senha nova de sempre" }),
      contexto
    );
    expect(resposta.status).toBe(410);
  });

  it("token torto não custa ida ao banco", async () => {
    const { POST } = await import("@/app/api/sessao/senha/route");
    const resposta = await POST(
      pedido({ token: "não-é-token", senha: "a senha nova de sempre" }),
      contexto
    );
    expect(resposta.status).toBe(410);
    expect(banco.instrucoes).toEqual([]);
  });

  it("senha curta reprova antes de gastar o token — o link continua valendo", async () => {
    const { POST } = await import("@/app/api/sessao/senha/route");
    const resposta = await POST(pedido({ token: "a".repeat(64), senha: "curta" }), contexto);

    expect(resposta.status).toBe(400);
    expect(banco.instrucoes.some(i => /update usuario_tokens/.test(i.texto))).toBe(false);
  });
});

describe("pedir a senha nova", () => {
  it("**responde igual para e-mail conhecido e desconhecido**", async () => {
    const { POST } = await import("@/app/api/sessao/recuperacao/route");

    banco.usuario = { id: USUARIO, email: CADASTRO.email, senha_hash: "x" };
    const comConta = await POST(pedido({ email: CADASTRO.email }), contexto);

    banco.usuario = null;
    const semConta = await POST(pedido({ email: "ninguem@exemplo.com" }), contexto);

    expect(comConta.status).toBe(202);
    expect(semConta.status).toBe(202);
    expect(await comConta.json()).toEqual(await semConta.json());
    // O e-mail só saiu no caso real — e o corpo não conta isso a quem pediu.
    expect(emails).toHaveLength(1);
    expect(emails[0].texto).toMatch(/\/recuperar\/[0-9a-f]{64}/);
  });

  it("e-mail sem formato de e-mail também responde 202", async () => {
    const { POST } = await import("@/app/api/sessao/recuperacao/route");
    const resposta = await POST(pedido({ email: "abc" }), contexto);
    expect(resposta.status).toBe(202);
    expect(emails).toHaveLength(0);
  });
});
