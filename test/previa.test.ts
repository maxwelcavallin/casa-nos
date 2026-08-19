import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import type { Evento } from "@/lib/eventos";
import { CATALOGO } from "@/lib/secoes";
import { montarSite } from "@/lib/site-publico";

/**
 * A PRÉVIA MOSTRA O SITE, E NÃO UMA APROXIMAÇÃO DELE (v1.0, V-10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O critério da história é uma frase só: **"o que a prévia esconde, o site
 * esconde; o que ela mostra, o site mostra"**. Ele é fácil de cumprir no dia em
 * que se escreve a tela e fácil de quebrar em qualquer dia depois — porque
 * quebrá-lo não produz tela quebrada, não produz erro e não produz log. Produz
 * um casal que aprova o que viu e um convidado que vê outra coisa.
 *
 * O que segura isso está em dois lugares:
 *   - `test/site-secoes.test.tsx` — nenhuma das três telas remonta o site por
 *     conta própria, e só a prévia desliga a medição.
 *   - este arquivo — a montagem compartilhada obedece as flags, e a prévia
 *     resolve o evento por um caminho que **não** exige `publicado = true`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const PREVIA = "app/painel/[eventoId]/previa/page.tsx";
const FONTE_DA_PREVIA = fs.readFileSync(path.join(RAIZ, PREVIA), "utf8");

/** Tira comentário antes de varrer: documentar a decisão não é violá-la. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const EVENTO: Evento = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "ana-e-max",
  nomeCasal: "Ana Flávia e Maxwel",
  dataEvento: "2027-08-22",
  fuso: "America/Sao_Paulo",
  horaEvento: "16:00:00",
  // As duas flags que a prévia precisa obedecer: horário guardado e NÃO
  // publicado, nome do local guardado e NÃO publicado.
  horaPublicada: false,
  cidade: "Rio de Janeiro",
  uf: "RJ",
  localNome: "Mansão que ainda não foi divulgada",
  localNomePublicado: false,
  localEndereco: "Rua que ainda não foi divulgada, 100",
  localLatitude: -22.97,
  localLongitude: -43.37,
  localRaioMetros: 4000,
  localRevelacao: "regiao",
  // O estado que a prévia existe para atender.
  publicado: false,
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

/**
 * Um banco falso que **grava o que foi perguntado**.
 *
 * A pergunta desta história não é "o conteúdo apareceu?" — é "o conteúdo foi
 * BUSCADO?". Seção desligada cujo texto é lido e descartado continua viajando no
 * HTML (RV-01), e nenhuma asserção sobre a tela pega isso.
 */
function bancoFalso(secoesLigadas: string[]) {
  const consultas: string[] = [];

  const exec = ((partes: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = partes.join("?");
    consultas.push(texto);

    if (/from evento_secoes/.test(texto)) {
      /**
       * O catálogo INTEIRO, com `ativa` por chave. Devolver só as ligadas não
       * serviria: `listarSecoes` trata linha ausente como o padrão do catálogo,
       * e toda seção nasce LIGADA — o teste veria tudo ligado e passaria sem
       * verificar nada.
       */
      return Promise.resolve(
        CATALOGO.map(secao => ({
          chave: secao.chave,
          ativa: secoesLigadas.includes(secao.chave),
          ordem: secao.ordemPadrao,
        }))
      );
    }
    if (/from evento_historia/.test(texto)) {
      return Promise.resolve([{ titulo: "Como foi", texto: "O segredo do casal." }]);
    }
    if (/from evento_programacao/.test(texto)) {
      return Promise.resolve([
        { id: "a", hora: "16:00:00", titulo: "Cerimônia secreta", descricao: null, ordem: 1 },
      ]);
    }
    if (/from evento_perguntas/.test(texto)) {
      return Promise.resolve([
        { id: "b", pergunta: "Tem estacionamento?", resposta: "Tem.", ordem: 1 },
        // Sem resposta: não pode chegar ao componente (RV-02).
        { id: "c", pergunta: "Qual o traje?", resposta: null, ordem: 2 },
      ]);
    }
    if (/from evento_indicacoes/.test(texto)) {
      return Promise.resolve([
        {
          id: "d",
          evento_id: EVENTO.id,
          tipo: "hospedagem",
          titulo: "Hotel Segredo",
          descricao: null,
          referencia: null,
          url: null,
          ordem: 1,
        },
      ]);
    }
    void valores;
    return Promise.resolve([]);
  }) as Executor;

  return { exec, consultas };
}

describe("a montagem do site obedece as flags — e a prévia herda isso", () => {
  it("**funciona com `publicado = false`**, que é a razão de a prévia existir", async () => {
    /**
     * `buscarEventoPorSlug` exige `publicado = true`, e é daí que nasce a V-10:
     * até ela, um site fora do ar não era visível para ninguém, nem para o
     * casal. `montarSite` recebe o evento já resolvido e **não** olha a coluna —
     * quem decide qual evento é a tela.
     */
    const { exec } = bancoFalso(["capa", "onde", "rodape"]);
    const dados = await montarSite(EVENTO, exec);
    expect(dados.evento.nomeCasal).toBe("Ana Flávia e Maxwel");
  });

  it("o horário guardado e não publicado **não sai** na prévia", async () => {
    const { exec } = bancoFalso(["capa", "onde", "rodape"]);
    const dados = await montarSite(EVENTO, exec);
    // Se saísse aqui e não no site, o casal aprovaria um site que anuncia um
    // horário que ele decidiu não anunciar.
    expect(dados.evento.horaEvento).toBeNull();
  });

  it("o nome do local guardado e não publicado **não sai**, e o endereço também não", async () => {
    const { exec } = bancoFalso(["capa", "onde", "rodape"]);
    const dados = await montarSite(EVENTO, exec);
    expect(dados.evento.localNome).toBeNull();
    // `regiao` não entrega o endereço: a área é vaga de propósito, e a rua
    // entregaria o que o zoom esconde.
    expect(dados.evento.localEndereco).toBeNull();
    expect(dados.evento.mapa).toEqual({
      latitude: -22.97,
      longitude: -43.37,
      precisao: "regiao",
      raioMetros: 4000,
    });
  });

  it("**o conteúdo de seção desligada não é nem buscado**", async () => {
    const { exec, consultas } = bancoFalso(["capa", "onde", "rodape"]);
    const dados = await montarSite(EVENTO, exec);

    const perguntou = (tabela: string) => consultas.some(c => c.includes(tabela));
    expect(perguntou("evento_historia"), "buscou a história de uma seção desligada").toBe(
      false
    );
    expect(perguntou("evento_programacao")).toBe(false);
    expect(perguntou("evento_perguntas")).toBe(false);
    expect(perguntou("evento_indicacoes")).toBe(false);

    expect(dados.historia).toBeNull();
    expect(dados.programacao).toEqual([]);
    expect(dados.perguntas).toEqual([]);
    expect(dados.indicacoes).toEqual([]);
  });

  it("seção ligada é buscada, e a pergunta sem resposta continua fora", async () => {
    const { exec } = bancoFalso(["capa", "historia", "perguntas", "rodape"]);
    const dados = await montarSite(EVENTO, exec);

    expect(dados.historia?.texto).toBe("O segredo do casal.");
    expect(dados.perguntas.map(p => p.pergunta)).toEqual(["Tem estacionamento?"]);
    // A ordem do casal é a ordem da lista, e `capa`/`rodape` continuam nela.
    expect(dados.secoes).toEqual(["capa", "historia", "perguntas", "rodape"]);
  });

  it("o estado vazio é um estado real: só capa e rodapé não quebra nada", async () => {
    /**
     * O critério da V-10 chama isso de estado vazio e pede que ele **não pareça
     * quebrado**. Aqui o que se verifica é a metade que dá para verificar sem
     * navegador: a montagem devolve uma lista válida, sem nulo no meio.
     */
    const { exec } = bancoFalso(["capa", "rodape"]);
    const dados = await montarSite(EVENTO, exec);
    expect(dados.secoes).toEqual(["capa", "rodape"]);
    expect(dados.programacao).toEqual([]);
  });
});

describe("a tela da prévia", () => {
  it("valida o `[eventoId]` antes de consultar, e responde 404", () => {
    // A mesma régua de `test/rotas-id-validado.test.ts`, escrita aqui também
    // porque esta é a primeira tela de painel que mostra o site inteiro.
    expect(FONTE_DA_PREVIA).toMatch(/if \(!ehUuid\(eventoId\)\) notFound\(\)/);
  });

  it("**404 e não 403** para quem não pode editar este site", () => {
    /**
     * O casal do casamento A que receber este link não pode nem descobrir que o
     * id do B existe. 403 confirmaria que existe.
     */
    expect(FONTE_DA_PREVIA).toMatch(
      /podeNoEvento\(sessao, "site\.editar", evento\) === "nao"\) notFound\(\)/
    );
  });

  it("não indexa", () => {
    // O endereço mostra o site inteiro sem ele estar no ar. Um buscador que o
    // indexasse publicaria o que o casal ainda não quis publicar.
    expect(FONTE_DA_PREVIA).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });

  it("busca o evento por id, e **não** por slug", () => {
    /**
     * `buscarEventoPorSlug` exige `publicado = true`. Usá-lo aqui faria a prévia
     * responder 404 exatamente no caso em que ela existe para funcionar — e o
     * sintoma seria "a prévia não abre", sem nada dizendo por quê.
     */
    expect(FONTE_DA_PREVIA).toMatch(/buscarEventoPorId\(eventoId\)/);
    // Sem os comentários: o cabeçalho da tela **explica** por que o caminho do
    // slug não serve aqui, e contar essa menção reprovaria justamente o arquivo
    // que documenta a decisão.
    expect(semComentarios(FONTE_DA_PREVIA)).not.toMatch(/buscarEventoPorSlug|eventoPorSlug/);
  });

  it("a faixa da prévia não entra na lista de seções do site", () => {
    /**
     * *"Ela não faz parte do que é renderizado como site — some da contagem de
     * seções e não empurra o conteúdo."* A faixa é irmã de `PaginaDoEvento`, e
     * não filha: nada dentro do site sabe que ela existe.
     */
    const faixa = fs.readFileSync(
      path.join(RAIZ, "components/painel/site/FaixaDePrevia.tsx"),
      "utf8"
    );
    expect(faixa).toMatch(/position:\s*"fixed"/);
    // `PaginaDoEvento` é auto-fechada: a faixa é IRMÃ dela, e não filha. Como
    // filha, ela entraria no `Stack` que ordena as seções, herdaria o `gap` dele
    // e empurraria o conteúdo para baixo.
    expect(semComentarios(FONTE_DA_PREVIA)).toMatch(
      /<PaginaDoEvento \{\.\.\.dados\} medir=\{false\} \/>/
    );
  });
});
