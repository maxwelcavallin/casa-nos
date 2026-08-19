import { describe, expect, it } from "vitest";

import {
  CAMPOS_DO_EVENTO,
  TABELAS_INTOCADAS,
  contar,
  planejarDominios,
  planejarEvento,
  planejarIndicacoes,
} from "@/scripts/seed-plano.mjs";

/**
 * O SEED DEPOIS DA V-12 — a catraca da promessa "rodar de novo não desfaz nada".
 *
 * Até a V1.6b o `pnpm db:seed` reescrevia o evento inteiro e apagava todas as
 * indicações antes de reinserir as do arquivo. Com o painel no ar, um comando de
 * rotina desfazia em silêncio o que a noiva tinha escrito — sem erro, sem aviso,
 * e sem nada na tela que dissesse que aconteceu.
 *
 * ESTE TESTE É DE MESA, E É DE PROPÓSITO. A decisão "este campo está vazio?" não
 * tem nada de SQL: ela mora em `scripts/seed-plano.mjs`, que é puro. Provar isso
 * contra um Postgres de verdade custaria um banco no CI para verificar um `if` —
 * e a versão com banco falso seria o teste respondendo a si mesmo.
 *
 * O caso caro é o **segundo** `pnpm db:seed`: o primeiro cria, o segundo é o que
 * roda por engano meses depois, com o site já editado.
 */

type Linha = { acao: string; motivo: string };
type Plano = { criar: boolean; valores: Record<string, unknown>; linhas: (Linha & { coluna: string })[] };

const planoDoEvento = planejarEvento as (dados: unknown, atual: unknown) => Plano;
const planoDasIndicacoes = planejarIndicacoes as (
  dados: unknown,
  titulos: string[],
) => { inserir: { titulo: string; ordem: number }[]; linhas: (Linha & { titulo: string })[] };
const planoDosDominios = planejarDominios as (
  dados: unknown,
  dominios: string[],
) => { inserir: { dominio: string; principal: boolean }[]; linhas: (Linha & { dominio: string })[] };
const somar = contar as (...conjuntos: Linha[][]) => { semeados: number; mantidos: number };

const ARQUIVO = {
  slug: "ana-e-max",
  nomeCasal: "Ana Flávia e Maxwel",
  dataEvento: "2027-08-22",
  horaEvento: null,
  horaPublicada: false,
  fuso: "America/Sao_Paulo",
  cidade: "Rio de Janeiro",
  uf: "RJ",
  localNome: null,
  localNomePublicado: false,
  localEndereco: null,
  localLatitude: -22.97,
  localLongitude: -43.37,
  localRaioMetros: 4000,
  localRevelacao: "regiao",
  publicado: true,
  dominios: [{ dominio: "anaemax.com.br", principal: true }],
  indicacoes: [{ tipo: "hospedagem", titulo: "Hotel do Arquivo", url: "https://exemplo.com.br" }],
};

/** A linha do banco como ela fica depois do primeiro seed — o evento recém-criado. */
function comoNasceu() {
  return {
    id: "e1",
    slug: "ana-e-max",
    nome_casal: "Ana Flávia e Maxwel",
    data_evento: "2027-08-22",
    hora_evento: null,
    cidade: "Rio de Janeiro",
    uf: "RJ",
    local_nome: null,
    local_endereco: null,
    local_latitude: "-22.970000",
    local_longitude: "-43.370000",
    local_raio_metros: 4000,
  };
}

describe("o seed cria o evento que não existe", () => {
  const plano = planoDoEvento(ARQUIVO, null);

  it("semeia todos os campos, inclusive os de decisão", () => {
    expect(plano.criar).toBe(true);
    expect(plano.linhas.every(l => l.acao === "semeado")).toBe(true);
    expect(Object.keys(plano.valores)).toHaveLength(CAMPOS_DO_EVENTO.length);
  });

  it("os booleanos entram na criação — é o único momento em que o arquivo os decide", () => {
    expect(plano.valores.publicado).toBe(true);
    expect(plano.valores.hora_publicada).toBe(false);
    expect(plano.valores.local_revelacao).toBe("regiao");
  });
});

describe("a segunda rodada — o comando que roda por engano", () => {
  it("não escreve coluna nenhuma", () => {
    const plano = planoDoEvento(ARQUIVO, comoNasceu());
    expect(plano.criar).toBe(false);
    expect(plano.valores).toEqual({});
  });

  it("não insere indicação que já existe, e não exclui nada", () => {
    const plano = planoDasIndicacoes(ARQUIVO, ["Hotel do Arquivo"]);
    expect(plano.inserir).toEqual([]);
    expect(plano.linhas.every(l => l.acao === "mantido")).toBe(true);
  });

  it("não cadastra o domínio de novo", () => {
    const plano = planoDosDominios(ARQUIVO, ["anaemax.com.br"]);
    expect(plano.inserir).toEqual([]);
  });
});

describe("o evento que o casal editou — nada do painel é revertido", () => {
  /**
   * O estado que o painel produz e que o seed antigo destruía: nome trocado,
   * horário fechado, nome do local preenchido, e o site tirado do ar.
   */
  const editado = {
    ...comoNasceu(),
    nome_casal: "Ana e Max",
    hora_evento: "16:00:00",
    local_nome: "Casa da Praia",
    local_endereco: "Rua tal, 100",
  };

  const plano = planoDoEvento(ARQUIVO, editado);

  it("não escreve nada, mesmo com o arquivo discordando do banco", () => {
    expect(plano.valores).toEqual({});
  });

  it("o campo que o painel preencheu é relatado como mantido, não silenciado", () => {
    const linha = plano.linhas.find(l => l.coluna === "nome_casal");
    expect(linha?.acao).toBe("mantido");
    expect(linha?.motivo).toContain("painel");
  });

  /**
   * O CASO QUE MAIS IMPORTA, E O ÚNICO IRREVERSÍVEL PELA PESSOA QUE ERROU:
   * o casal tirou o site do ar por decisão, com a consequência escrita na tela
   * de confirmação. O arquivo continua dizendo `publicado: true` — ele foi
   * escrito antes de o painel existir. Um seed que "corrigisse" isso republicaria
   * o site sem ninguém pedir.
   */
  it("não republica um site que o casal tirou do ar", () => {
    const foraDoAr = planoDoEvento(ARQUIVO, { ...editado, publicado: false });
    expect(foraDoAr.valores.publicado).toBeUndefined();
    expect(foraDoAr.linhas.find(l => l.coluna === "publicado")?.acao).toBe("mantido");
  });

  it("não revela o nome do local que o casal escondeu", () => {
    expect(plano.valores.local_nome_publicado).toBeUndefined();
  });

  it("a indicação que o casal acrescentou pelo painel continua de pé", () => {
    const doPainel = planoDasIndicacoes(ARQUIVO, ["Hotel do Arquivo", "Pousada que a noiva achou"]);
    expect(doPainel.inserir).toEqual([]);
    expect(doPainel.linhas).toHaveLength(1); // só o item do arquivo é relatado
  });
});

describe("o campo vazio — a única coisa que o seed ainda preenche", () => {
  it("horário nulo no banco recebe o horário do arquivo", () => {
    const plano = planoDoEvento({ ...ARQUIVO, horaEvento: "16:00" }, comoNasceu());
    expect(plano.valores.hora_evento).toBe("16:00");
    expect(plano.linhas.find(l => l.coluna === "hora_evento")?.acao).toBe("semeado");
  });

  it("texto só com espaço conta como vazio — senão o campo fica preso para sempre", () => {
    const plano = planoDoEvento({ ...ARQUIVO, localNome: "Casa da Praia" }, {
      ...comoNasceu(),
      local_nome: "   ",
    });
    expect(plano.valores.local_nome).toBe("Casa da Praia");
  });

  it("vazio nos dois lados não vira escrita", () => {
    const plano = planoDoEvento(ARQUIVO, comoNasceu());
    expect(plano.linhas.find(l => l.coluna === "hora_evento")?.motivo).toContain("vazio");
    expect(plano.valores.hora_evento).toBeUndefined();
  });

  /**
   * `hora_publicada: false` com `hora_evento` preenchido é estado coerente: o
   * horário existe no banco e não é anunciado. Semear o horário sem virar a flag
   * é o comportamento certo — a flag é decisão do casal.
   */
  it("semear o horário não o publica", () => {
    const plano = planoDoEvento({ ...ARQUIVO, horaEvento: "16:00", horaPublicada: true }, comoNasceu());
    expect(plano.valores.hora_evento).toBe("16:00");
    expect(plano.valores.hora_publicada).toBeUndefined();
  });
});

describe("indicações — insere o que falta, e nunca exclui", () => {
  it("insere só a que não existe", () => {
    const arquivo = {
      indicacoes: [
        { tipo: "hospedagem", titulo: "Hotel A" },
        { tipo: "dica", titulo: "Dica B" },
      ],
    };
    const plano = planoDasIndicacoes(arquivo, ["Hotel A"]);
    expect(plano.inserir.map(i => i.titulo)).toEqual(["Dica B"]);
  });

  it("a chave ignora caixa e espaço — senão o mesmo hotel entra duas vezes", () => {
    const plano = planoDasIndicacoes({ indicacoes: [{ titulo: "  hotel a " }] }, ["Hotel A"]);
    expect(plano.inserir).toEqual([]);
  });

  it("o arquivo repetindo o mesmo título não insere dois", () => {
    const plano = planoDasIndicacoes({ indicacoes: [{ titulo: "Hotel A" }, { titulo: "Hotel A" }] }, []);
    expect(plano.inserir).toHaveLength(1);
  });

  it("a ordem cai na posição do arquivo quando ele não a declara", () => {
    const plano = planoDasIndicacoes({ indicacoes: [{ titulo: "A" }, { titulo: "B" }] }, []);
    expect(plano.inserir.map(i => i.ordem)).toEqual([1, 2]);
  });
});

describe("a saída do comando", () => {
  it("termina com o número dos dois lados", () => {
    const plano = planoDoEvento(ARQUIVO, comoNasceu());
    const total = somar(plano.linhas, [], []);
    expect(total.semeados + total.mantidos).toBe(CAMPOS_DO_EVENTO.length);
    expect(total.semeados).toBe(0);
  });

  /**
   * As cinco tabelas nomeadas na saída. `evento_fotos` está aqui pelo motivo mais
   * duro dos cinco: foto é binário num balde, e um seed que subisse objeto seria
   * um segundo montador de chave do R2 — exatamente o que `r2-prefixos` proíbe.
   */
  it("nomeia as cinco tabelas que não são tocadas", () => {
    expect(TABELAS_INTOCADAS).toEqual([
      "evento_secoes",
      "evento_historia",
      "evento_programacao",
      "evento_perguntas",
      "evento_fotos",
    ]);
  });
});
