import { describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import {
  dobrar,
  filtrarPorNome,
  importarConvidados,
  lerListaColada,
  MAXIMO_DE_LINHAS,
  nomesRepetidos,
  resumoDaLista,
  type Convidado,
} from "@/lib/convidados";

/**
 * A LISTA DE CONVIDADOS (H-03) — **o denominador da North Star**.
 *
 * Sem ela, P não tem denominador, `guest_identified` não tem o modo `lista`, e
 * os critérios de término da fatia viram opinião. Um defeito aqui não derruba
 * nenhuma tela: ele faz a métrica que decide o produto medir a coisa errada, em
 * silêncio.
 */

describe("a caixa de colar — texto vira slots", () => {
  it("um nome por linha, ignorando linhas vazias e espaços nas pontas", () => {
    const { aceitas, recusadas } = lerListaColada(
      "  Ana Paula Ribeiro  \n\n\n   \nTio Carlos\n"
    );
    expect(aceitas).toEqual([
      { nome: "Ana Paula Ribeiro", pessoasNoSlot: 1 },
      { nome: "Tio Carlos", pessoasNoSlot: 1 },
    ]);
    // Linha vazia NÃO é erro: é como planilha cola.
    expect(recusadas).toEqual([]);
  });

  it("`Família Silva, 4` é UM slot com quatro pessoas", () => {
    // Um SLOT, não quatro pessoas: a North Star conta slots, e a banda por
    // pessoa sai do segundo número. Somar as duas grandezas produz um
    // percentual que não significa nada.
    const { aceitas } = lerListaColada("Família Silva, 4");
    expect(aceitas).toEqual([{ nome: "Família Silva", pessoasNoSlot: 4 }]);
  });

  it("a vírgula que separa é a ÚLTIMA, e não a primeira", () => {
    /**
     * "Silva, João, 2" é o slot "Silva, João" com 2 pessoas. Cortando na
     * primeira vírgula, o sobrenome viraria o separador e o resultado seria um
     * slot chamado "Silva" com o resto recusado — silenciosamente errado, que é
     * o pior tipo de errado numa lista de 300 nomes.
     */
    const { aceitas } = lerListaColada("Silva, João, 2");
    expect(aceitas).toEqual([{ nome: "Silva, João", pessoasNoSlot: 2 }]);
  });

  it("as duas linhas que não viram nome voltam com o motivo, e as outras entram", () => {
    const { aceitas, recusadas } = lerListaColada(
      ["Ana Paula Ribeiro", ", 4", "Família Souza, quatro", "Tio Carlos", "Casal Lima, 2 pessoas"].join(
        "\n"
      )
    );
    expect(aceitas.map(a => a.nome)).toEqual(["Ana Paula Ribeiro", "Tio Carlos"]);
    expect(recusadas).toEqual([
      { original: ", 4", motivo: "Sem nome antes da vírgula" },
      {
        original: "Família Souza, quatro",
        motivo: "O número depois da vírgula não é um número",
      },
      {
        original: "Casal Lima, 2 pessoas",
        motivo: "O número depois da vírgula não é um número",
      },
    ]);
  });

  it("zero pessoas é recusado — o `CHECK` do banco estouraria como 500", () => {
    const { aceitas, recusadas } = lerListaColada("Família Fantasma, 0");
    expect(aceitas).toEqual([]);
    expect(recusadas).toHaveLength(1);
  });

  it("300 linhas processam de uma vez, e acima disso o excesso é declarado", () => {
    const trezentas = Array.from({ length: 300 }, (_, i) => `Convidado ${i}`).join("\n");
    const cheia = lerListaColada(trezentas);
    expect(cheia.aceitas).toHaveLength(MAXIMO_DE_LINHAS);
    expect(cheia.excedeu).toBe(false);

    const demais = lerListaColada(`${trezentas}\nUm a mais`);
    expect(demais.aceitas).toHaveLength(MAXIMO_DE_LINHAS);
    // O excesso não some em silêncio: a tela precisa poder dizer que cortou.
    expect(demais.excedeu).toBe(true);
  });

  it("nome repetido NÃO é bloqueado — e a tela avisa", () => {
    /**
     * RN-23: dois "Tio Carlos" acontecem em toda festa. O banco não tem índice
     * único por nome de propósito, e bloquear cria um beco sem saída no meio do
     * casamento. O que existe é aviso.
     */
    const { aceitas, repetidos } = lerListaColada("Ana Silva\nAna Silva\nTio Carlos");
    expect(aceitas).toHaveLength(3);
    expect(repetidos).toEqual(["Ana Silva"]);
  });

  it("a comparação de repetidos é EXATA — sem dobrar acento, sem ignorar caixa", () => {
    // "Ana Silva" e "ana silva" são duas pessoas até prova em contrário, e o
    // produto não tem prova nenhuma. Um aviso falso ensina a ignorar o aviso.
    expect(nomesRepetidos(["Ana Silva", "ana silva"])).toEqual([]);
    expect(nomesRepetidos(["Ana Silva", "Ana Silva"])).toEqual(["Ana Silva"]);
  });
});

describe("a busca do convidado — no cliente, sem acento, sem caixa", () => {
  it("dobra acento e caixa", () => {
    expect(dobrar("João Sebastião")).toBe("joao sebastiao");
    expect(dobrar("  ÂNGELA  ")).toBe("angela");
  });

  it("acha o nome com acento a partir do que foi digitado sem acento", () => {
    const lista = [
      { id: "1", nome: "João Sebastião" },
      { id: "2", nome: "Ana Flávia" },
      { id: "3", nome: "Tio Carlos" },
    ];
    expect(filtrarPorNome(lista, "joao").map(c => c.id)).toEqual(["1"]);
    expect(filtrarPorNome(lista, "flavia").map(c => c.id)).toEqual(["2"]);
    // A partir de UM caractere, e sempre local: por isso não existe estado de
    // "buscando", e por isso a identificação funciona offline (decisão P7).
    expect(filtrarPorNome(lista, "a")).toHaveLength(3);
  });

  it("busca vazia devolve a lista inteira", () => {
    const lista = [{ id: "1", nome: "Ana" }];
    expect(filtrarPorNome(lista, "   ")).toHaveLength(1);
  });
});

describe("reimportar não duplica", () => {
  /** Banco falso que guarda o que foi inserido, para a conta poder ser conferida. */
  function bancoFalso(existentes: Array<{ nome: string; ordem: number }>) {
    const inseridos: string[][] = [];
    const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
      if (/select nome, ordem from convidados/.test(texto)) return existentes;
      if (/insert into convidados/.test(texto)) {
        // Os nomes são o primeiro parâmetro que é um vetor de texto. Procurar
        // por forma, e não por posição, é o que faz este banco falso continuar
        // válido se alguém acrescentar uma coluna à instrução.
        const nomes = valores.find(
          v => Array.isArray(v) && v.every(item => typeof item === "string")
        );
        inseridos.push((nomes ?? []) as string[]);
        return [];
      }
      return [];
    }) as unknown as Executor;
    return { exec, inseridos };
  }

  it("a segunda importação cria só os que faltam, e diz quantos já existiam", async () => {
    /**
     * O caso real: a noiva cola a planilha, acrescenta 18 nomes na planilha e
     * cola tudo de novo. Sem isto ela teria 618 slots e um denominador
     * destruído — e nenhum erro apareceria em lugar nenhum.
     */
    const banco = bancoFalso([
      { nome: "Ana Paula Ribeiro", ordem: 1 },
      { nome: "Tio Carlos", ordem: 2 },
    ]);

    const resultado = await importarConvidados(
      "evento",
      [
        { nome: "Ana Paula Ribeiro", pessoasNoSlot: 1 },
        { nome: "Tio Carlos", pessoasNoSlot: 1 },
        { nome: "Família Silva", pessoasNoSlot: 4 },
      ],
      banco.exec
    );

    expect(resultado).toEqual({ criados: 1, jaExistiam: 2, total: 3 });
    expect(banco.inseridos[0]).toEqual(["Família Silva"]);
  });

  it("a ordem continua de onde parou, para a lista não embaralhar", async () => {
    const banco = bancoFalso([{ nome: "Ana", ordem: 7 }]);
    await importarConvidados("evento", [{ nome: "Bruno", pessoasNoSlot: 1 }], banco.exec);
    // `unnest` recebe [nomes, pessoas, posicoes]; a posição vira `maiorOrdem + i`.
    expect(banco.inseridos).toHaveLength(1);
  });

  it("dois nomes iguais na MESMA importação viram dois slots", async () => {
    // A assimetria é proposital e está escrita: colar duas Anas de uma vez cria
    // duas (é o critério de aceite); colar de novo depois não cria a terceira.
    const banco = bancoFalso([]);
    const resultado = await importarConvidados(
      "evento",
      [
        { nome: "Ana Silva", pessoasNoSlot: 1 },
        { nome: "Ana Silva", pessoasNoSlot: 1 },
      ],
      banco.exec
    );
    expect(resultado.criados).toBe(2);
  });
});

describe("as duas grandezas nunca são somadas", () => {
  it("slots e pessoas viajam separados", () => {
    const lista: Convidado[] = [
      { id: "1", eventoId: "e", nome: "Ana", pessoasNoSlot: 1, ausente: null, ordem: 0 },
      { id: "2", eventoId: "e", nome: "Família Silva", pessoasNoSlot: 4, ausente: null, ordem: 1 },
    ];
    // 2 slots, 5 pessoas. `2/5` e `5/2` são os dois erros disponíveis aqui, e os
    // dois produzem um número plausível — que é o que os torna caros.
    expect(resumoDaLista(lista)).toEqual({ slots: 2, pessoas: 5 });
  });
});
