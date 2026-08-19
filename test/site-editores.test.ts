import { describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import type { Evento } from "@/lib/eventos";
import {
  atualizarIndicacao,
  conferirIndicacao,
  contarIndicacoes,
  criarIndicacao,
  ehUrlDeLink,
  excluirIndicacao,
  listarIndicacoesDoPainel,
  MAXIMO_DE_INDICACOES,
  TETOS,
} from "@/lib/indicacoes";
import { conferirEvento, LIMITES_DO_MAPA, TETOS_DO_EVENTO } from "@/lib/site-evento";

/**
 * O QUE OS EDITORES DA v1.0 ACEITAM GRAVAR (V-04, V-05 e V-06).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **RODA COM `TZ=UTC`** (`vitest.config.mts`), que é como a Vercel roda. Todo bug
 * de data deste produto — o site anunciando 21 de agosto para um casamento no
 * dia 22 — só existe em UTC: a máquina de quem desenvolve roda em Brasília, e é
 * o único ambiente onde o defeito não aparece.
 *
 * A validação toda é **do servidor** (RV-09). O `maxLength` do campo é
 * conveniência; um `PATCH` montado à mão passa por cima dele, e o `CHECK` do
 * banco viraria 500 onde a resposta certa é 400 com a frase do campo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ANA = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

const EVENTO: Evento = {
  id: ANA,
  slug: "ana-e-max",
  nomeCasal: "Ana Flávia e Maxwel",
  dataEvento: "2027-08-22",
  fuso: "America/Sao_Paulo",
  horaEvento: null,
  horaPublicada: false,
  cidade: "Rio de Janeiro",
  uf: "RJ",
  localNome: null,
  localNomePublicado: false,
  localEndereco: null,
  localLatitude: null,
  localLongitude: null,
  localRaioMetros: null,
  localRevelacao: "oculto",
  publicado: true,
  albumAtivo: false,
  modoModeracao: "direto",
  envioAbreEm: null,
  envioFechaEm: null,
  enviosEncerradosEm: null,
  novosAparelhosBloqueados: false,
  inicioFestaEm: null,
  fimFestaEm: null,
  presentesContagem: null,
  emailCasal: null,
};

/* ------------------------------------------------------------------ *
 * V-04 — a capa
 * ------------------------------------------------------------------ */

describe("a capa: quem casa e quando", () => {
  it("aceita nome, data, horário e cidade", () => {
    const { mudanca, erros } = conferirEvento(
      {
        nome_casal: "  Ana Flávia e Maxwel  ",
        data_evento: "2027-08-22",
        hora_evento: "16:00",
        cidade: "Rio de Janeiro",
        uf: "rj",
      },
      EVENTO
    );
    expect(erros).toEqual({});
    expect(mudanca.nomeCasal).toBe("Ana Flávia e Maxwel");
    // A data continua sendo a STRING que entrou. Se em algum ponto ela passasse
    // por `Date`, aqui em UTC ela voltaria como 21/08.
    expect(mudanca.dataEvento).toBe("2027-08-22");
    expect(mudanca.horaEvento).toBe("16:00");
    // A UF é normalizada, e não recusada: quem digita "rj" no celular está
    // certo, e recusar seria hostil.
    expect(mudanca.uf).toBe("RJ");
  });

  it("**a data nunca passa por `Date`** — a véspera não vira a data do casamento", () => {
    /**
     * O defeito que esta linha impede: `new Date("2027-08-22")` é meia-noite em
     * UTC, que é 21h do dia 21 em Brasília. Num relatório financeiro isso é um
     * mês errado; num site de casamento é a data errada do casamento, impressa
     * em 150 convites digitais.
     */
    for (const data of ["2027-08-22", "2027-01-01", "2027-12-31"]) {
      const { mudanca } = conferirEvento({ data_evento: data }, EVENTO);
      expect(mudanca.dataEvento, `${data} mudou de dia`).toBe(data);
    }
  });

  it("recusa data e hora fora do formato, com a frase do campo", () => {
    const { erros } = conferirEvento(
      { data_evento: "22/08/2027", hora_evento: "quatro da tarde" },
      EVENTO
    );
    expect(erros.data_evento).toBeTruthy();
    expect(erros.hora_evento).toBe("O horário vai no formato 16:00.");
  });

  it("**anunciar o horário sem ter horário responde erro NO CAMPO DO HORÁRIO**", () => {
    /**
     * A frase vai no campo do horário e não no da flag: o que falta é o horário,
     * e é lá que a pessoa precisa digitar. Pôr a mensagem na flag mandaria a
     * noiva desligar o que ela acabou de ligar de propósito.
     */
    const { erros } = conferirEvento({ hora_publicada: true }, EVENTO);
    expect(erros.hora_evento).toBe("Preencha o horário para poder anunciá-lo no site.");
  });

  it("anunciar o horário JUNTO com o horário passa", () => {
    // A regra olha o estado DEPOIS da mudança. Sem isso, salvar as duas coisas
    // no mesmo envio — que é o que a tela faz — seria sempre recusado.
    const { erros } = conferirEvento(
      { hora_publicada: true, hora_evento: "16:00" },
      EVENTO
    );
    expect(erros).toEqual({});
  });

  it("anunciar o horário com ele JÁ GRAVADO passa", () => {
    const comHorario: Evento = { ...EVENTO, horaEvento: "16:00:00" };
    const { erros } = conferirEvento({ hora_publicada: true }, comHorario);
    expect(erros).toEqual({});
  });

  it("o horário pode ser apagado de volta para 'ainda não definido'", () => {
    // Nulo aqui É um valor. Sem isso, um horário errado ficaria para sempre.
    const { mudanca, erros } = conferirEvento({ hora_evento: "" }, EVENTO);
    expect(erros).toEqual({});
    expect(mudanca.horaEvento).toBeNull();
  });

  it("recusa nome acima do teto **com o número escrito**", () => {
    const longo = "a".repeat(TETOS_DO_EVENTO.nomeCasal + 14);
    const { erros } = conferirEvento({ nome_casal: longo }, EVENTO);
    // Quem escreveu 74 caracteres precisa saber quantos cortar. "Longo demais"
    // não diz.
    expect(erros.nome_casal).toContain(String(longo.length));
    expect(erros.nome_casal).toContain(String(TETOS_DO_EVENTO.nomeCasal));
  });

  it("campo ausente não vira mudança", () => {
    // O que não foi mandado fica como está: salvar só a cidade não pode apagar o
    // horário.
    const { mudanca } = conferirEvento({ cidade: "Niterói" }, EVENTO);
    expect(Object.keys(mudanca)).toEqual(["cidade"]);
  });
});

/* ------------------------------------------------------------------ *
 * V-05 — onde e quando
 * ------------------------------------------------------------------ */

describe("onde e quando: sem revelar o que ainda não pode", () => {
  it("anunciar o nome do local sem nome responde erro no campo do nome", () => {
    const { erros } = conferirEvento({ local_nome_publicado: true }, EVENTO);
    expect(erros.local_nome).toBe("Preencha o nome do local para poder anunciá-lo.");
  });

  it("`exato` sem endereço responde erro", () => {
    const comPonto: Evento = { ...EVENTO, localLatitude: -22.95, localLongitude: -43.37 };
    const { erros } = conferirEvento({ local_revelacao: "exato" }, comPonto);
    expect(erros.local_endereco).toBeTruthy();
  });

  it("`regiao` sem coordenada responde erro", () => {
    // Sem ponto não há área para desenhar, e o mapa apareceria vazio no site do
    // casal sem nenhum erro em lugar nenhum.
    const { erros } = conferirEvento({ local_revelacao: "regiao" }, EVENTO);
    expect(erros.local_latitude).toBeTruthy();
  });

  it("`oculto` não exige nada — é o estado inicial de todo casamento", () => {
    const { erros } = conferirEvento({ local_revelacao: "oculto" }, EVENTO);
    expect(erros).toEqual({});
  });

  it("**latitude, longitude e raio respondem com o INTERVALO escrito**", () => {
    /**
     * Quem digitou `43` no lugar de `-43` precisa ver o que é aceito. "Valor
     * inválido" faz a pessoa tentar de novo com outro número errado.
     */
    const fora = conferirEvento(
      { local_latitude: 120, local_longitude: -400, local_raio_metros: 50 },
      EVENTO
    );
    expect(fora.erros.local_latitude).toContain(String(LIMITES_DO_MAPA.latitude[1]));
    expect(fora.erros.local_longitude).toContain(String(LIMITES_DO_MAPA.longitude[0]));
    expect(fora.erros.local_raio_metros).toContain(String(LIMITES_DO_MAPA.raioMetros[0]));
  });

  it("aceita a coordenada negativa do Rio", () => {
    const { mudanca, erros } = conferirEvento(
      {
        local_revelacao: "regiao",
        local_latitude: "-22.951916",
        local_longitude: "-43.370000",
        local_raio_metros: "4000",
      },
      EVENTO
    );
    expect(erros).toEqual({});
    expect(mudanca.localLatitude).toBeCloseTo(-22.951916, 6);
    expect(mudanca.localRaioMetros).toBe(4000);
  });

  it("o raio precisa ser inteiro — metros quebrados não existem no mapa", () => {
    const { erros } = conferirEvento({ local_raio_metros: 4000.5 }, EVENTO);
    expect(erros.local_raio_metros).toBeTruthy();
  });

  it("o ponto pode ser apagado de volta", () => {
    const comPonto: Evento = { ...EVENTO, localLatitude: -22.95, localLongitude: -43.37 };
    const { mudanca, erros } = conferirEvento(
      { local_latitude: null, local_longitude: null, local_revelacao: "oculto" },
      comPonto
    );
    expect(erros).toEqual({});
    expect(mudanca.localLatitude).toBeNull();
  });

  it("recusa nível de revelação inventado", () => {
    const { erros } = conferirEvento({ local_revelacao: "quase" }, EVENTO);
    expect(erros.local_revelacao).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * V-06 — onde ficar e dicas
 * ------------------------------------------------------------------ */

describe("o link de uma indicação aceita só http e https", () => {
  it("aceita http e https", () => {
    expect(ehUrlDeLink("https://hotel.com.br/reserva")).toBe(true);
    expect(ehUrlDeLink("http://hotel.com.br")).toBe(true);
  });

  it("**recusa `javascript:`** — e é o motivo de a lista ser fechada", () => {
    /**
     * O campo é preenchido por quem cola o endereço de outra aba. Um link colado
     * de um lugar errado vira XSS armazenado no site do casamento, tocado por
     * 150 pessoas.
     */
    for (const lixo of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "mailto:noiva@exemplo.com",
      "tel:+5521999999999",
      "/hotel",
      "hotel.com.br",
      "",
    ]) {
      expect(ehUrlDeLink(lixo), `${lixo} passou`).toBe(false);
    }
  });

  it("a rota recusa com a frase do campo, e não com 'erro'", () => {
    const { erros } = conferirIndicacao(
      { tipo: "hospedagem", titulo: "Hotel", url: "javascript:alert(1)" },
      { parcial: false }
    );
    expect(erros.map(e => e.campo)).toContain("url");
    expect(erros.find(e => e.campo === "url")?.mensagem).toContain("http");
  });
});

describe("os tetos de uma indicação", () => {
  it("recusa cada campo acima do teto, com o número", () => {
    const { erros } = conferirIndicacao(
      {
        tipo: "dica",
        titulo: "t".repeat(TETOS.titulo + 1),
        referencia: "r".repeat(TETOS.referencia + 1),
        descricao: "d".repeat(TETOS.descricao + 1),
      },
      { parcial: false }
    );
    expect(erros.map(e => e.campo).sort()).toEqual(["descricao", "referencia", "titulo"]);
    for (const erro of erros) expect(erro.mensagem).toMatch(/\d+/);
  });

  it("exige título na criação e não exige na edição", () => {
    // `PATCH` parcial: campo ausente não mexe no que está gravado. Sem essa
    // distinção, salvar só o link apagaria a descrição.
    expect(conferirIndicacao({ tipo: "dica" }, { parcial: false }).erros).toHaveLength(1);
    expect(conferirIndicacao({ descricao: "nova" }, { parcial: true }).erros).toHaveLength(0);
  });

  it("campo vazio na edição significa limpar, e não 'não mexer'", () => {
    const { dados } = conferirIndicacao({ url: null, referencia: "" }, { parcial: true });
    expect(dados.url).toBeNull();
    expect(dados.referencia).toBeNull();
  });

  it("recusa tipo fora de hospedagem e dica", () => {
    const { erros } = conferirIndicacao(
      { tipo: "restaurante", titulo: "X" },
      { parcial: false }
    );
    expect(erros.map(e => e.campo)).toContain("tipo");
  });
});

/* ------------------------------------------------------------------ *
 * Inquilino A não escreve no B
 * ------------------------------------------------------------------ */

type Linha = Record<string, unknown>;

function bancoFalso(linhas: Linha[]) {
  const registro: Array<{ texto: string; valores: unknown[] }> = [];
  const exec = (async (strings: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = strings.join(" ? ").replace(/\s+/g, " ");
    registro.push({ texto, valores });

    if (/count\(\*\)/.test(texto)) {
      const [eventoId] = valores;
      return [{ quantas: linhas.filter(l => l.evento_id === eventoId).length }];
    }
    if (/select \* from evento_indicacoes/.test(texto)) {
      const [eventoId] = valores;
      return linhas.filter(l => l.evento_id === eventoId && l.excluido_em === null);
    }
    if (/insert into evento_indicacoes/.test(texto)) {
      const [eventoId, tipo, titulo] = valores;
      return [
        {
          id: "cccc1111-1111-4111-8111-111111111111",
          evento_id: eventoId,
          tipo,
          titulo,
          referencia: null,
          descricao: null,
          url: null,
          ordem: 1,
        },
      ];
    }
    if (/update evento_indicacoes set excluido_em/.test(texto)) {
      const [indicacaoId, eventoId] = valores.slice(0);
      const achada = linhas.find(l => l.id === indicacaoId && l.evento_id === eventoId);
      return achada ? [{ id: achada.id }] : [];
    }
    if (/update evento_indicacoes set/.test(texto)) {
      // Os dois últimos parâmetros são o id e o evento_id do `where`.
      const eventoId = valores[valores.length - 1];
      const indicacaoId = valores[valores.length - 2];
      const achada = linhas.find(l => l.id === indicacaoId && l.evento_id === eventoId);
      return achada ? [achada] : [];
    }
    throw new Error(`Consulta não prevista: ${texto}`);
  }) as unknown as Executor;
  return { exec, registro };
}

const DA_ANA: Linha = {
  id: "aaaa1111-1111-4111-8111-111111111111",
  evento_id: ANA,
  tipo: "hospedagem",
  titulo: "Hotel da Ana",
  referencia: null,
  descricao: null,
  url: null,
  ordem: 1,
  excluido_em: null,
};

const DO_OUTRO: Linha = { ...DA_ANA, id: "bbbb1111-1111-4111-8111-111111111111", evento_id: OUTRO };

describe("as indicações de um casamento não vazam para o outro", () => {
  it("a listagem do painel filtra o evento", async () => {
    const { exec, registro } = bancoFalso([DA_ANA, DO_OUTRO]);
    const lista = await listarIndicacoesDoPainel(ANA, exec);
    expect(lista).toHaveLength(1);
    expect(registro[0].valores).toEqual([ANA]);
  });

  it("**editar a indicação de outro evento devolve nada — e a rota vira 404**", async () => {
    // 404 e não 403: 403 confirmaria que ela existe, e a lista de hotéis do
    // outro casamento não é informação que este produto deva dar.
    const { exec } = bancoFalso([DA_ANA, DO_OUTRO]);
    expect(
      await atualizarIndicacao(ANA, DO_OUTRO.id as string, { titulo: "Sequestrado" }, exec)
    ).toBeNull();
  });

  it("apagar a indicação de outro evento devolve falso", async () => {
    const { exec } = bancoFalso([DA_ANA, DO_OUTRO]);
    expect(await excluirIndicacao(ANA, DO_OUTRO.id as string, exec)).toBe(false);
    expect(await excluirIndicacao(ANA, DA_ANA.id as string, exec)).toBe(true);
  });

  it("criar carrega o `evento_id` do servidor", async () => {
    const { exec, registro } = bancoFalso([]);
    await criarIndicacao(
      OUTRO,
      { tipo: "dica", titulo: "Dica", referencia: null, descricao: null, url: null, ordem: 1 },
      exec
    );
    expect(registro[0].valores[0]).toBe(OUTRO);
  });

  it("a contagem do teto é POR EVENTO", async () => {
    // Contar sem filtro faria o vigésimo hotel de um casamento bloquear o
    // primeiro do outro — e ninguém entenderia por quê.
    const muitas = Array.from({ length: MAXIMO_DE_INDICACOES }, (_, i) => ({
      ...DO_OUTRO,
      id: `dddd${String(i).padStart(4, "0")}-1111-4111-8111-111111111111`,
    }));
    const { exec } = bancoFalso([DA_ANA, ...muitas]);
    expect(await contarIndicacoes(ANA, exec)).toBe(1);
    expect(await contarIndicacoes(OUTRO, exec)).toBe(MAXIMO_DE_INDICACOES);
  });
});
