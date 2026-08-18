import { describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import {
  buscarEventoPorDominio,
  buscarEventoPorSlug,
  listarIndicacoes,
  recortePublico,
  type Evento,
} from "@/lib/eventos";

/**
 * INQUILINO A NÃO LÊ O INQUILINO B.
 *
 * É o bug mais caro deste modelo e é invisível em teste com um inquilino só —
 * por isso o banco falso abaixo tem DOIS casamentos desde a primeira linha. Um
 * `where` esquecido passa despercebido enquanto existir um evento no ar, e
 * aparece no dia em que o segundo casal entrar: a página de um mostrando o hotel
 * do outro.
 *
 * O banco é falso de propósito. Isto verifica a consulta que o código monta —
 * inclusive QUE ela filtra por `evento_id` —, e roda sem credencial, no CI, em
 * qualquer máquina.
 */

const ANA: Record<string, unknown> = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "ana-e-max",
  nome_casal: "Ana Flávia e Maxwel",
  data_evento: "2027-08-22",
  hora_evento: null,
  hora_publicada: false,
  fuso: "America/Sao_Paulo",
  cidade: "Rio de Janeiro",
  uf: "RJ",
  local_nome: "Local que ainda não foi divulgado",
  local_nome_publicado: false,
  local_endereco: "Rua que ainda não foi divulgada, 100",
  local_latitude: "-22.970000",
  local_longitude: "-43.370000",
  local_raio_metros: 4000,
  local_revelacao: "regiao",
  publicado: true,
};

const OUTRO: Record<string, unknown> = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "bea-e-caio",
  nome_casal: "Beatriz e Caio",
  data_evento: "2028-03-11",
  hora_evento: "17:00:00",
  hora_publicada: true,
  fuso: "America/Sao_Paulo",
  cidade: "Curitiba",
  uf: "PR",
  local_nome: "Salão do outro casamento",
  local_nome_publicado: true,
  local_endereco: "Rua do outro casamento, 200",
  local_latitude: "-25.430000",
  local_longitude: "-49.270000",
  local_raio_metros: null,
  local_revelacao: "exato",
  publicado: true,
};

const RASCUNHO: Record<string, unknown> = { ...OUTRO, id: "33333333-3333-4333-8333-333333333333", slug: "rascunho", publicado: false };

const DOMINIOS = [
  { dominio: "anaemax.com.br", evento: ANA },
  { dominio: "beaecaio.com.br", evento: OUTRO },
];

const INDICACOES = [
  { id: "aaaa1111-1111-4111-8111-111111111111", evento_id: ANA.id, tipo: "hospedagem", titulo: "Hotel da Ana", descricao: null, referencia: "Barra", url: null, ordem: 2, publicado: true, excluido_em: null },
  { id: "aaaa2222-2222-4222-8222-222222222222", evento_id: ANA.id, tipo: "dica", titulo: "Dica da Ana", descricao: null, referencia: null, url: null, ordem: 1, publicado: true, excluido_em: null },
  { id: "bbbb1111-1111-4111-8111-111111111111", evento_id: OUTRO.id, tipo: "hospedagem", titulo: "Hotel do Caio", descricao: null, referencia: null, url: null, ordem: 1, publicado: true, excluido_em: null },
  { id: "aaaa3333-3333-4333-8333-333333333333", evento_id: ANA.id, tipo: "dica", titulo: "Dica escondida da Ana", descricao: null, referencia: null, url: null, ordem: 3, publicado: false, excluido_em: null },
];

type Registro = { texto: string; valores: unknown[] };

/**
 * Banco falso que responde às três consultas do produto e GUARDA o que foi
 * perguntado. É o registro que permite afirmar que a consulta de indicações
 * carregou o `evento_id` — e não só que ela devolveu o resultado certo por
 * acaso.
 */
function bancoFalso() {
  const registro: Registro[] = [];

  const exec = (async (strings: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = strings.join(" ? ").replace(/\s+/g, " ");
    registro.push({ texto, valores });

    if (/from evento_dominios/.test(texto)) {
      const [dominio] = valores;
      const achado = DOMINIOS.find(d => d.dominio === dominio);
      return achado && achado.evento.publicado ? [achado.evento] : [];
    }

    if (/from eventos/.test(texto)) {
      const [slug] = valores;
      const achado = [ANA, OUTRO, RASCUNHO].find(e => e.slug === slug);
      return achado && achado.publicado ? [achado] : [];
    }

    if (/from evento_indicacoes/.test(texto)) {
      const [eventoId] = valores;
      return INDICACOES.filter(i => i.evento_id === eventoId && i.publicado).sort(
        (a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo)
      );
    }

    throw new Error(`Consulta não prevista no banco falso: ${texto}`);
  }) as unknown as Executor;

  return { exec, registro };
}

describe("resolução do evento por slug", () => {
  it("devolve o evento daquele slug, e não outro", async () => {
    const { exec } = bancoFalso();
    const evento = await buscarEventoPorSlug("ana-e-max", exec);
    expect(evento?.nomeCasal).toBe("Ana Flávia e Maxwel");
    expect(evento?.id).toBe(ANA.id);
  });

  it("evento não publicado não aparece só porque alguém acertou o slug", async () => {
    const { exec } = bancoFalso();
    expect(await buscarEventoPorSlug("rascunho", exec)).toBeNull();
  });

  it("slug malformado nem chega ao banco", async () => {
    const { exec, registro } = bancoFalso();
    expect(await buscarEventoPorSlug("../../etc/passwd", exec)).toBeNull();
    expect(
      registro,
      "Slug inválido virou consulta. A validação existe para o banco não receber lixo da URL."
    ).toHaveLength(0);
  });
});

describe("resolução do evento por domínio", () => {
  it("cada domínio leva ao seu casamento", async () => {
    const { exec } = bancoFalso();
    expect((await buscarEventoPorDominio("anaemax.com.br", exec))?.id).toBe(ANA.id);
    expect((await buscarEventoPorDominio("beaecaio.com.br", exec))?.id).toBe(OUTRO.id);
  });

  it("www, porta e caixa alta chegam no mesmo lugar", async () => {
    const { exec } = bancoFalso();
    for (const host of ["www.anaemax.com.br", "AnaEMax.com.br", "anaemax.com.br:3000"]) {
      expect((await buscarEventoPorDominio(host, exec))?.id, host).toBe(ANA.id);
    }
  });

  it("domínio desconhecido é 404, e NÃO o primeiro casamento da lista", async () => {
    const { exec } = bancoFalso();
    expect(await buscarEventoPorDominio("casamento-de-outra-pessoa.com.br", exec)).toBeNull();
    expect(await buscarEventoPorDominio(null, exec)).toBeNull();
  });
});

describe("indicações — o inquilino A não lê o B", () => {
  it("lista só as indicações do próprio evento", async () => {
    const { exec } = bancoFalso();
    const daAna = await listarIndicacoes(String(ANA.id), exec);
    expect(daAna.map(i => i.titulo)).toEqual(["Dica da Ana", "Hotel da Ana"]);
    expect(
      daAna.some(i => i.titulo.includes("Caio")),
      "Vazou indicação de outro casamento."
    ).toBe(false);
  });

  it("a consulta carrega o evento_id — não é o resultado que está certo por acaso", async () => {
    const { exec, registro } = bancoFalso();
    await listarIndicacoes(String(ANA.id), exec);
    const consulta = registro.at(-1);
    expect(consulta?.texto).toMatch(/evento_id = \?/);
    expect(consulta?.valores[0]).toBe(ANA.id);
  });

  it("item despublicado não aparece", async () => {
    const { exec } = bancoFalso();
    const daAna = await listarIndicacoes(String(ANA.id), exec);
    expect(daAna.some(i => i.titulo === "Dica escondida da Ana")).toBe(false);
  });
});

describe("recorte público — o que o casal escondeu não sai do servidor", () => {
  async function evento(qual: "ana" | "outro"): Promise<Evento> {
    const { exec } = bancoFalso();
    const e = await buscarEventoPorSlug(qual === "ana" ? "ana-e-max" : "bea-e-caio", exec);
    if (!e) throw new Error("evento não encontrado no banco falso");
    return e;
  }

  it("o nome do local não publicado NÃO existe no objeto que vai para o navegador", async () => {
    const publico = recortePublico(await evento("ana"));
    expect(publico.localNome).toBeNull();
    // A prova de que não é só "não renderizar": o valor não está em lugar
    // nenhum do que atravessa a fronteira. Renderizar sem mostrar deixaria o
    // nome no HTML, e o primeiro convidado curioso o encontraria.
    expect(JSON.stringify(publico)).not.toContain("Local que ainda não foi divulgado");
  });

  it("com revelação por região: mapa sim, endereço não", async () => {
    const publico = recortePublico(await evento("ana"));
    expect(publico.mapa).toEqual({
      latitude: -22.97,
      longitude: -43.37,
      precisao: "regiao",
      raioMetros: 4000,
    });
    expect(publico.localEndereco).toBeNull();
    expect(JSON.stringify(publico)).not.toContain("Rua que ainda não foi divulgada");
  });

  it("com revelação exata: nome, endereço e pin", async () => {
    const publico = recortePublico(await evento("outro"));
    expect(publico.localNome).toBe("Salão do outro casamento");
    expect(publico.localEndereco).toBe("Rua do outro casamento, 200");
    expect(publico.mapa?.precisao).toBe("exato");
  });

  it("hora não publicada não vaza", async () => {
    expect(recortePublico(await evento("ana")).horaEvento).toBeNull();
    expect(recortePublico(await evento("outro")).horaEvento).toBe("17:00:00");
  });

  it("coordenada `numeric` vira número, e não string concatenável", async () => {
    // `numeric` chega do Postgres como string. Somar string concatena, e uma
    // latitude concatenada manda o convidado para o outro lado do mundo.
    const publico = recortePublico(await evento("ana"));
    expect(typeof publico.mapa?.latitude).toBe("number");
    expect(typeof publico.mapa?.longitude).toBe("number");
  });
});
