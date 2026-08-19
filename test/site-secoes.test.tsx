import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { PaginaDoEvento } from "@/components/evento/PaginaDoEvento";
import { Providers } from "@/components/Providers";
import type { Historia, Momento, Pergunta } from "@/lib/conteudo-do-site";
import type { EventoPublico, Indicacao } from "@/lib/eventos";
import { CHAVES_DE_SECAO, type ChaveDeSecao } from "@/lib/secoes";

/**
 * O QUE O SITE MOSTRA, E O QUE ELE **NÃO DEIXA VAZAR** (v1.0, RV-01 e RV-02).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RV-01 tem duas metades, e a segunda é a que se esquece:
 *
 *   1. Seção desligada não RENDERIZA.
 *   2. O conteúdo dela **não viaja no HTML**.
 *
 * "Não renderizar" não esconde nada de quem abre o código-fonte da página. O
 * casal que desliga "onde ficar" porque ainda não fechou os hotéis, e mesmo
 * assim entrega a lista a quem apertar Ctrl+U, não teve o que pediu.
 *
 * O corte de verdade acontece antes, no servidor: a página **não busca** o
 * conteúdo de uma seção desligada. Este arquivo verifica as duas pontas — o
 * componente, montando de verdade, e a página, lendo o código.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const AGORA = new Date("2026-08-19T12:00:00.000Z").getTime();

const EVENTO: EventoPublico = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "ana-e-max",
  nomeCasal: "Ana Flávia e Maxwel",
  dataEvento: "2027-08-22",
  dataPorExtensoFuso: "America/Sao_Paulo",
  horaEvento: null,
  cidade: "Rio de Janeiro",
  uf: "RJ",
  localNome: null,
  localEndereco: null,
  mapa: null,
};

const INDICACOES: Indicacao[] = [
  {
    id: "aaaa1111-1111-4111-8111-111111111111",
    eventoId: EVENTO.id,
    tipo: "hospedagem",
    titulo: "Hotel Segredo do Casal",
    descricao: "Café da manhã incluso",
    referencia: "8 min do local",
    url: "https://exemplo.invalid/hotel",
    ordem: 1,
  },
];

const HISTORIA: Historia = {
  titulo: "Como tudo começou",
  texto: "Primeiro parágrafo do segredo.\n\nSegundo parágrafo.",
};

const PROGRAMACAO: Momento[] = [
  { id: "m1", hora: "16:00", titulo: "Cerimônia secreta", descricao: null, ordem: 1 },
  { id: "m2", hora: null, titulo: "A festa até o fim", descricao: null, ordem: 2 },
];

const PERGUNTAS: Pergunta[] = [
  { id: "p1", pergunta: "Qual é o traje?", resposta: "Esporte fino secreto.", ordem: 1 },
];

function montar(
  secoes: readonly ChaveDeSecao[],
  indicacoes: Indicacao[] = INDICACOES,
  {
    historia = HISTORIA,
    programacao = PROGRAMACAO,
    perguntas = PERGUNTAS,
  }: { historia?: Historia | null; programacao?: Momento[]; perguntas?: Pergunta[] } = {}
) {
  return render(
    <Providers>
      <PaginaDoEvento
        evento={EVENTO}
        indicacoes={indicacoes}
        agoraMs={AGORA}
        secoes={secoes}
        historia={historia}
        programacao={programacao}
        perguntas={perguntas}
      />
    </Providers>
  );
}

describe("seção desligada some do site", () => {
  it("com tudo ligado, a indicação aparece", () => {
    montar(CHAVES_DE_SECAO);
    expect(screen.getByText("Hotel Segredo do Casal")).toBeInTheDocument();
  });

  it("**desligada, o nome do hotel não existe no HTML** (RV-01)", () => {
    const { container } = montar(["capa", "onde", "rodape"]);

    expect(screen.queryByText("Hotel Segredo do Casal")).toBeNull();
    // A varredura do HTML inteiro é o ponto: `queryByText` sozinho não distingue
    // "não desenhou" de "desenhou escondido".
    expect(
      container.innerHTML,
      "O conteúdo de uma seção desligada apareceu no HTML. Esconder na " +
        "renderização não esconde de quem abre o código-fonte."
    ).not.toContain("Hotel Segredo do Casal");
    expect(container.innerHTML).not.toContain("exemplo.invalid");
  });

  it("desligar `onde` tira a seção e o texto dela", () => {
    const { container } = montar(["capa", "indicacoes", "rodape"]);
    expect(container.innerHTML).not.toContain("Vai ser em Rio de Janeiro");
  });

  it("**seção ligada e vazia também não renderiza** (RV-02)", () => {
    // O comportamento que `SecaoIndicacoes` já tinha, e que passou a valer para
    // todas: uma seção vazia num convite não informa nada e ainda sugere que
    // alguém esqueceu de preencher.
    const { container } = montar(CHAVES_DE_SECAO, []);
    expect(container.innerHTML).not.toContain("Onde ficar");
  });

  it("a capa e o rodapé aparecem sempre", () => {
    // Elas não são condicionais no componente (RV-06): escrever o `if` delas
    // daria a impressão de que podem ser desligadas.
    montar(["capa", "rodape"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ana Flávia e Maxwel");
  });
});

describe("as três seções novas (V-07, V-08, V-09)", () => {
  it("a história renderiza com um parágrafo por linha em branco", () => {
    const { container } = montar(CHAVES_DE_SECAO);
    expect(screen.getByText("Como tudo começou")).toBeInTheDocument();
    expect(screen.getByText("Primeiro parágrafo do segredo.")).toBeInTheDocument();
    expect(screen.getByText("Segundo parágrafo.")).toBeInTheDocument();
    // Dois parágrafos, e não um texto com quebra: a linha em branco separou.
    expect(container.innerHTML).not.toContain(
      "Primeiro parágrafo do segredo.\n\nSegundo"
    );
  });

  it("**HTML colado do WhatsApp aparece escrito, e não como marcação** (RV-07)", () => {
    /**
     * O caso concreto: a noiva copia um trecho já formatado de outro lugar e
     * cola no editor. Sem o escape, `<script>` no texto do casal vira XSS
     * armazenado numa página que 150 pessoas abrem.
     */
    const { container } = montar(CHAVES_DE_SECAO, INDICACOES, {
      historia: { titulo: null, texto: "<b>oi</b> e <script>alert(1)</script>" },
    });
    expect(screen.getByText("<b>oi</b> e <script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("história sem texto: a seção some (RV-02)", () => {
    const { container } = montar(CHAVES_DE_SECAO, INDICACOES, { historia: null });
    expect(container.innerHTML).not.toContain("A nossa história");
  });

  it("**momento sem hora mostra travessão, e nunca `--:--` nem `00:00`**", () => {
    const { container } = montar(CHAVES_DE_SECAO);
    expect(screen.getByText("A festa até o fim")).toBeInTheDocument();
    expect(screen.getByText("Cerimônia secreta")).toBeInTheDocument();
    // `16:00` é exibido como `16h` por `lib/datas.ts`.
    expect(screen.getByText("16h")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("--:--");
    expect(container.innerHTML).not.toContain("00:00");
    expect(container.innerHTML).not.toContain("0h<");
  });

  it("programação vazia: a seção some (RV-02)", () => {
    const { container } = montar(CHAVES_DE_SECAO, INDICACOES, { programacao: [] });
    expect(container.innerHTML).not.toContain("Cerimônia secreta");
  });

  it("as perguntas respondidas aparecem", () => {
    montar(CHAVES_DE_SECAO);
    expect(screen.getByText("Qual é o traje?")).toBeInTheDocument();
    expect(screen.getByText("Esporte fino secreto.")).toBeInTheDocument();
  });

  it("nenhuma pergunta respondida: a seção some (RV-02)", () => {
    const { container } = montar(CHAVES_DE_SECAO, INDICACOES, { perguntas: [] });
    expect(container.innerHTML).not.toContain("Perguntas frequentes");
  });

  it("desligar as três tira o conteúdo delas do HTML (RV-01)", () => {
    const { container } = montar(["capa", "onde", "indicacoes", "rodape"]);
    expect(container.innerHTML).not.toContain("Primeiro parágrafo do segredo.");
    expect(container.innerHTML).not.toContain("Cerimônia secreta");
    expect(container.innerHTML).not.toContain("Esporte fino secreto.");
  });
});

describe("a ordem do casal é a ordem do site", () => {
  it("trocar a ordem das seções troca a ordem no HTML", () => {
    /**
     * Se as seções fossem sete `&&` em sequência, a ordem seria a do código e
     * reordenar no painel não teria efeito nenhum — sem erro, sem sintoma, e o
     * casal concluindo que o botão não funciona.
     */
    const { container: a } = montar(["capa", "onde", "indicacoes", "rodape"]);
    const posicaoOndeAntes = a.innerHTML.indexOf("Rio de Janeiro");
    const posicaoHotelAntes = a.innerHTML.indexOf("Hotel Segredo do Casal");
    expect(posicaoOndeAntes).toBeLessThan(posicaoHotelAntes);

    const { container: b } = montar(["capa", "indicacoes", "onde", "rodape"]);
    const posicaoOndeDepois = b.innerHTML.indexOf("Rio de Janeiro");
    const posicaoHotelDepois = b.innerHTML.indexOf("Hotel Segredo do Casal");
    expect(posicaoHotelDepois).toBeLessThan(posicaoOndeDepois);
  });
});

describe("a página não BUSCA o conteúdo de seção desligada", () => {
  /**
   * A metade que o teste de DOM não alcança. Uma página que buscasse tudo e
   * passasse adiante só o que está ligado continuaria certa na tela — e voltaria
   * a errar no dia em que alguém acrescentasse um campo ao recorte público.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * A V-10 MUDOU ONDE ESTA VARREDURA OLHA, e a mudança é o ponto.
   *
   * Até a prévia existir, este bloco estava escrito duas vezes — uma por página
   * pública — e o teste conferia as duas cópias. Com a prévia seriam três, e
   * três é o número em que alguém acrescenta a seção nova em duas delas: a
   * prévia mentiria, o casal aprovaria o que viu, e o convidado veria outra
   * coisa. Que é exatamente o erro que a prévia existe para evitar.
   *
   * Agora existe **uma** montagem (`lib/site-publico.ts`), e a varredura tem
   * duas partes: as condições estão lá, e **nenhuma tela remonta o site por
   * conta própria**. A segunda parte é a que segura de verdade.
   * ───────────────────────────────────────────────────────────────────────────
   */
  const MONTAGEM = "lib/site-publico.ts";

  /** As três telas que renderizam o site: duas públicas e a prévia (V-10). */
  const TELAS_DO_SITE = [
    "app/page.tsx",
    "app/e/[slug]/page.tsx",
    "app/painel/[eventoId]/previa/page.tsx",
  ];

  function ler(relativo: string): string {
    return fs.readFileSync(path.join(RAIZ, relativo), "utf8");
  }

  it("**as quatro buscas de conteúdo são condicionadas à seção estar ligada**", () => {
    /**
     * Uma busca por seção, e cada uma atrás do seu `ligadas.includes(...)`. No
     * dia em que uma seção nova esquecer a condição, o conteúdo dela passa a
     * viajar no HTML mesmo desligada — e nada na tela acusa, porque o componente
     * continua não desenhando.
     */
    const BUSCAS: Array<[string, RegExp]> = [
      ["indicacoes", /ligadas\.includes\("indicacoes"\)\s*\?\s*listarIndicacoes/],
      ["historia", /ligadas\.includes\("historia"\)\s*\?\s*buscarHistoria/],
      ["programacao", /ligadas\.includes\("programacao"\)\s*\?\s*listarProgramacao/],
      ["perguntas", /ligadas\.includes\("perguntas"\)\s*\?\s*listarPerguntas/],
    ];

    const fonte = ler(MONTAGEM);
    const semCondicao = BUSCAS.filter(([, padrao]) => !padrao.test(fonte)).map(
      ([secao]) => `${MONTAGEM} → ${secao}`
    );

    expect(
      semCondicao,
      "Estas buscas acontecem mesmo com a seção desligada: " +
        semCondicao.join(", ") +
        ". O corte é no servidor, antes da consulta — não na renderização."
    ).toEqual([]);
  });

  it("**as perguntas são filtradas no SERVIDOR, e não no componente**", () => {
    /**
     * `perguntasRespondidas` roda na montagem do servidor. Filtrar dentro de
     * `SecaoPerguntas` daria o mesmo resultado na tela e deixaria o texto das
     * perguntas sugeridas e não respondidas no código-fonte — que é exatamente o
     * que torna seguro sugerir as cinco (V-16).
     */
    expect(ler(MONTAGEM)).toMatch(/\.then\(perguntasRespondidas\)/);
  });

  it("a montagem resolve as seções antes de devolver o conteúdo", () => {
    expect(ler(MONTAGEM)).toMatch(/chavesLigadas\(/);
  });

  it("**nenhuma das três telas do site remonta o conteúdo por conta própria**", () => {
    /**
     * A catraca da V-10, e a razão de ela existir está no critério: *"o que a
     * prévia esconde, o site esconde; o que ela mostra, o site mostra"*.
     *
     * Uma tela que chame `listarSecoes` ou `buscarHistoria` direto está montando
     * o site do seu jeito — e a divergência que nasce daí não aparece em tela
     * nenhuma, porque cada uma continua certa sozinha.
     */
    const proprias =
      /listarSecoes\(|chavesLigadas\(|buscarHistoria\(|listarProgramacao\(|listarPerguntas\(|listarIndicacoes\(/;

    const remontam: string[] = [];
    const semMontagem: string[] = [];
    for (const relativo of TELAS_DO_SITE) {
      const fonte = ler(relativo);
      if (proprias.test(fonte)) remontam.push(relativo);
      if (!/montarSite\(/.test(fonte)) semMontagem.push(relativo);
    }

    expect(
      remontam,
      "Estas telas montam o site por conta própria: " +
        remontam.join(", ") +
        ". Use `montarSite(evento)` de lib/site-publico.ts — com duas montagens, " +
        "a prévia pode divergir do site e nenhuma das duas telas acusa."
    ).toEqual([]);

    expect(semMontagem, "Estas telas não chamam montarSite: " + semMontagem.join(", ")).toEqual(
      []
    );
  });

  it("**só a prévia desliga a medição**", () => {
    /**
     * `medir={false}` na tela errada é o erro caro na direção oposta: o site
     * pararia de contar visita e nada avisaria — não há tela quebrada, não há
     * erro no console, e o GA4 não preenche o passado.
     */
    expect(ler("app/painel/[eventoId]/previa/page.tsx")).toMatch(/medir=\{false\}/);
    for (const publica of ["app/page.tsx", "app/e/[slug]/page.tsx"]) {
      expect(ler(publica), `${publica} não pode desligar a medição`).not.toMatch(/medir=/);
    }
  });
});
