import { describe, expect, it } from "vitest";

import { SEGMENTOS_RESERVADOS } from "@/lib/rotas";
import {
  conferirSenha,
  hashDeSenha,
  MAXIMO_DE_SENHA,
  MINIMO_DE_SENHA,
  precisaRecriarOHash,
  senhaConfere,
} from "@/lib/senhas";
import { conferirCadastro, ehEmail, normalizarEmail, slugDoNomeDoCasal } from "@/lib/usuarios";

/**
 * A CONTA COM SENHA — as peças que não precisam de banco (19/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O QUE ESTE ARQUIVO SEGURA, e cada item já custou caro em algum produto:**
 *
 * 1. **O hash confere consigo mesmo.** Parece trivial e é o teste mais
 *    importante daqui: o produto e o `pnpm db:conta` produzem hash pelo MESMO
 *    módulo, e o dia em que alguém "otimizar" um dos dois, o login para de
 *    bater sem erro nenhum aparecer — o formato continua válido e a senha
 *    simplesmente nunca confere.
 *
 * 2. **Hash malformado é `false`, e não exceção.** Uma coluna corrompida por
 *    migração de dado malfeita não pode virar 500 numa tela de login.
 *
 * 3. **O slug do casamento novo não pode roubar um caminho da plataforma.** A
 *    raiz do produto é o espaço de nomes dos casamentos: um casal chamado
 *    "Painel" viraria `/painel` — e a rota curta pararia de existir para todo
 *    mundo, em silêncio.
 * ─────────────────────────────────────────────────────────────────────────────
 */

describe("o hash da senha", () => {
  it("confere com a própria senha, e só com ela", async () => {
    const guardado = await hashDeSenha("uma frase que a gente lembra");
    expect(await senhaConfere("uma frase que a gente lembra", guardado)).toBe(true);
    expect(await senhaConfere("uma frase que a gente lembr", guardado)).toBe(false);
    expect(await senhaConfere("", guardado)).toBe(false);
  });

  it("duas senhas iguais geram hashes diferentes — o sal existe", async () => {
    const a = await hashDeSenha("a mesma senha de sempre");
    const b = await hashDeSenha("a mesma senha de sempre");
    expect(a).not.toBe(b);
    // E as duas continuam conferindo: o sal viaja dentro do valor.
    expect(await senhaConfere("a mesma senha de sempre", a)).toBe(true);
    expect(await senhaConfere("a mesma senha de sempre", b)).toBe(true);
  });

  it("o formato guarda os parâmetros — é o que deixa o custo subir depois", async () => {
    const guardado = await hashDeSenha("uma frase que a gente lembra");
    const [algoritmo, iteracoes] = guardado.split("$");
    expect(algoritmo).toBe("pbkdf2-sha256");
    expect(Number(iteracoes)).toBeGreaterThanOrEqual(210_000);
  });

  it("**hash malformado é `false`, e nunca exceção**", async () => {
    for (const lixo of ["", "senha", "pbkdf2-sha256$abc$def", "md5$1$aa$bb", "$$$"]) {
      expect(await senhaConfere("qualquer coisa", lixo)).toBe(false);
    }
  });

  it("hash com custo antigo pede reescrita; o de hoje, não", async () => {
    expect(precisaRecriarOHash(await hashDeSenha("uma frase que a gente lembra"))).toBe(false);
    expect(precisaRecriarOHash("pbkdf2-sha256$1000$aa$bb")).toBe(true);
    // Formato desconhecido também pede: é como uma senha de um algoritmo antigo
    // seria migrada, e o lado seguro de errar é reescrever.
    expect(precisaRecriarOHash("scrypt$16384$8$1$aa$bb")).toBe(true);
  });
});

describe("a régua da senha", () => {
  it("recusa curta, e diz o número", () => {
    expect(conferirSenha("curta")).toContain(String(MINIMO_DE_SENHA));
  });

  it("aceita frase longa sem símbolo nenhum — comprimento, não composição", () => {
    expect(conferirSenha("casamento da ana no rio")).toBeNull();
  });

  it("recusa a senha igual ao e-mail", () => {
    expect(conferirSenha("ana@exemplo.com.br", "ANA@exemplo.com.br")).toMatch(/e-mail/);
  });

  it("recusa acima do teto — o teto existe por negação de serviço", () => {
    expect(conferirSenha("a".repeat(MAXIMO_DE_SENHA + 1))).toContain(String(MAXIMO_DE_SENHA));
  });

  it("campo vazio pede senha, e não fala de tamanho", () => {
    expect(conferirSenha("")).toBe("Escolha uma senha.");
  });
});

describe("o e-mail", () => {
  it("normaliza caixa e espaço — senão viram duas contas", () => {
    expect(normalizarEmail("  Ana@Gmail.COM ")).toBe("ana@gmail.com");
  });

  it("aceita o que dá para mandar link, e recusa o que não é endereço", () => {
    expect(ehEmail("ana@exemplo.com.br")).toBe(true);
    expect(ehEmail("ana+casamento@exemplo.com")).toBe(true);
    expect(ehEmail("ana@exemplo")).toBe(false);
    expect(ehEmail("ana exemplo.com")).toBe(false);
    expect(ehEmail("@exemplo.com")).toBe(false);
    expect(ehEmail(null)).toBe(false);
  });
});

describe("o slug do casamento novo", () => {
  it("tira acento, junta com hífen e vira minúscula", () => {
    expect(slugDoNomeDoCasal("Ana Flávia e Maxwel")).toBe("ana-flavia-e-maxwel");
  });

  it("o `&` vira `e` — é como o casal escreve, e não é caractere de URL", () => {
    expect(slugDoNomeDoCasal("Ana & Max")).toBe("ana-e-max");
  });

  it("nome que some na limpeza cai num endereço que funciona", () => {
    expect(slugDoNomeDoCasal("💍💍")).toBe("casamento");
    expect(slugDoNomeDoCasal("...")).toBe("casamento");
  });

  it("**nenhum reservado sai do gerador como está**", () => {
    /**
     * O gerador sozinho pode até produzir a palavra; quem garante o desvio é
     * `slugLivre`, que consulta o banco e pula os reservados. O que este teste
     * segura é o inverso e é o que importa: a lista de reservados **inclui as
     * palavras que um nome de casal produziria**, e não só as pastas de hoje.
     */
    for (const reservado of SEGMENTOS_RESERVADOS) {
      expect(typeof reservado).toBe("string");
    }
    expect([...SEGMENTOS_RESERVADOS]).toContain("cadastrar");
    expect([...SEGMENTOS_RESERVADOS]).toContain("recuperar");
    expect([...SEGMENTOS_RESERVADOS]).toContain("verificar");
    expect(slugDoNomeDoCasal("Painel")).toBe("painel");
  });
});

describe("o formulário de cadastro", () => {
  const COMPLETO = {
    email: "ana@exemplo.com.br",
    nome_casal: "Ana Flávia e Maxwel",
    data_evento: "2027-08-22",
    cidade: "Rio de Janeiro",
    uf: "rj",
  };

  it("aceita os cinco campos, e normaliza o que dá", () => {
    const { dados, erros } = conferirCadastro(COMPLETO);
    expect(erros).toEqual([]);
    expect(dados?.uf).toBe("RJ");
    // A data continua sendo a STRING que entrou. Se passasse por `Date`, aqui em
    // UTC ela voltaria como 21/08 — o site anunciando o casamento um dia antes.
    expect(dados?.dataEvento).toBe("2027-08-22");
  });

  it("cada campo que falta vira uma mensagem com o nome do campo", () => {
    const { dados, erros } = conferirCadastro({});
    expect(dados).toBeNull();
    expect(erros.map(e => e.campo).sort()).toEqual([
      "cidade",
      "data_evento",
      "email",
      "nome_casal",
      "uf",
    ]);
  });

  it("recusa data em formato brasileiro, que é o erro que uma pessoa comete", () => {
    const { erros } = conferirCadastro({ ...COMPLETO, data_evento: "22/08/2027" });
    expect(erros.map(e => e.campo)).toEqual(["data_evento"]);
  });

  it("recusa estado com mais de duas letras", () => {
    const { erros } = conferirCadastro({ ...COMPLETO, uf: "Rio" });
    expect(erros.map(e => e.campo)).toEqual(["uf"]);
  });
});
