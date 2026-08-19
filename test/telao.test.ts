import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { LIMITE_DO_H1, temaTelao, VARIANTES_DO_TELAO, varianteDoNome } from "@/lib/theme-telao";
import { tema } from "@/lib/theme";
import { corProjecao, duracao, escalaProjecao } from "@/lib/tokens";

/**
 * O TELÃO (H-12) — **a tela cujo erro é indistinguível do funcionamento
 * normal**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NENHUM DOS DEFEITOS DESTA TELA TEM QUEM RECLAME. Ninguém "usa" um telão: ele
 * fica numa parede, atrás de uma mesa, ligado a um computador emprestado.
 * Congelado e rodando têm a mesma aparência da pista de dança, e o console
 * ninguém vai abrir.
 *
 * Então o que dá para verificar antes é a **forma**: que o tema tem as cinco
 * variantes e não mais, que as cores de estado estão desligadas, que o palco
 * pinta o próprio chão, e que nenhuma das nove proibições da parede aparece no
 * código. É pouco, e é honesto dizer que é pouco — o resto é o ensaio, com um
 * projetor de verdade.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");

function fonteDe(relativo: string): string {
  return fs
    .readFileSync(path.join(RAIZ, relativo), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("o tema da parede", () => {
  it("as cinco variantes existem, e nenhuma outra é redefinida (§14.4)", () => {
    /**
     * `h4`, `h5`, `h6`, `subtitle2`, `body2`, `caption`, `overline` e `button`
     * herdam os tamanhos em `rem` da página e, numa parede, saem minúsculos.
     * **É para sair minúsculo**: um tema que conserta tudo esconde a única
     * informação útil da revisão — que alguém tratou uma parede como se fosse um
     * card.
     */
    for (const variante of VARIANTES_DO_TELAO) {
      expect(String(temaTelao.typography[variante].fontSize)).toMatch(/vw$/);
    }
    for (const herdada of ["h4", "h5", "h6", "subtitle2", "body2", "caption", "overline"] as const) {
      expect(
        temaTelao.typography[herdada].fontSize,
        `${herdada} foi redefinida no telão. Ela precisa continuar minúscula, ` +
          "para a revisão ver o erro de desenho em vez de o tema escondê-lo."
      ).toBe(tema.typography[herdada].fontSize);
    }
  });

  it("o chão é o marinho de projeção, e nunca preto puro", () => {
    // Projetor não pinta preto: ele deixa de emitir. Um campo "preto" chapado só
    // denuncia o piso cinza do aparelho como um retângulo sujo contra a parede.
    expect(temaTelao.palette.background.default).toBe(corProjecao.fundo);
    expect(temaTelao.palette.background.default).not.toBe("#000000");
    expect(temaTelao.palette.text.primary).toBe(corProjecao.tinta);
    // A tinta é o algodão, não branco puro: um campo branco de 3 metros às 23h
    // ilumina o salão e apaga a luz cênica.
    expect(temaTelao.palette.text.primary).not.toBe("#FFFFFF");
  });

  it("as quatro cores de estado estão DESLIGADAS na parede (§17.2, item 2)", () => {
    /**
     * Medidas, elas dão de 1,32 a 2,19:1 deratadas. Não é gosto: é
     * ilegibilidade. Elas apontam para a tinta para que um `color="error.main"`
     * escrito por engano saia legível — e para que a revisão veja a intenção
     * errada em vez de um buraco na parede.
     */
    for (const papel of ["success", "warning", "error", "info"] as const) {
      expect(temaTelao.palette[papel].main, papel).toBe(corProjecao.tinta);
      expect(temaTelao.palette[papel].main).not.toBe(tema.palette[papel].main);
    }
  });

  it("o realce é a primária da parede, e não o marinho da página", () => {
    // Sobre o chão escuro, `cor.primary` mede 1.26:1 deratado — dois tons
    // escuros vizinhos viram um só.
    expect(temaTelao.palette.primary.main).toBe(corProjecao.realce);
    expect(temaTelao.palette.primary.main).not.toBe(tema.palette.primary.main);
  });

  it("a troca de variante do nome é pelo COMPRIMENTO da string", () => {
    // E não pelo olho de quem desenha: 24 caracteres em `h1`, 25 a 60 em `h2`.
    expect(varianteDoNome("ANA FLAVIA E MAXWEL")).toBe("h1");
    expect(varianteDoNome("A".repeat(LIMITE_DO_H1))).toBe("h1");
    expect(varianteDoNome("A".repeat(LIMITE_DO_H1 + 1))).toBe("h2");
    expect(
      varianteDoNome("MARIA APARECIDA NOGUEIRA E JOAO SEBASTIAO DE ALBUQUERQUE")
    ).toBe("h2");
  });

  it("o movimento da parede é 600 ms, e não os 200 da tela na mão", () => {
    // Um corte de 200 ms numa área mil vezes maior não é lido como transição, é
    // lido como flash. Numa sala escura, com 150 pessoas, isso é desconforto —
    // e para quem tem sensibilidade, risco.
    expect(duracao.projecao).toBe(600);
    expect(duracao.projecao).toBeGreaterThan(duracao.padrao);
  });

  it("o cartão do QR cabe no teto de campo claro de 25%", () => {
    // 30vw de lado + 2,5vw de respiro de cada lado = 35vw de largura. Em 16:9,
    // ~62vh de altura → 21,7% da tela. Dois campos claros somariam.
    const lado = Number.parseFloat(escalaProjecao.qrLado);
    const respiro = Number.parseFloat(escalaProjecao.qrRespiro);
    const larguraDoCartao = lado + respiro * 2;
    const alturaDoCartao = (larguraDoCartao * 16) / 9;
    const fracao = (larguraDoCartao * alturaDoCartao) / (100 * 100);
    expect(fracao).toBeLessThanOrEqual(escalaProjecao.campoClaroMaximo);
  });
});

describe("o palco pinta o próprio chão", () => {
  it("`PalcoTelao` declara `background.default` — sem isso, o primeiro quadro é branco", () => {
    /**
     * **O `MuiCssBaseline` NÃO é reexecutado num `ThemeProvider` aninhado.**
     *
     * Ele roda uma vez, no `Providers` da raiz, e é ele que pinta o `body` com
     * o algodão. Trocar o tema aqui dentro troca a cor dos COMPONENTES, não a do
     * `body` — e numa parede de três metros isso é um flash branco de três
     * metros no primeiro quadro, no meio da festa.
     *
     * Este teste existe porque o defeito é invisível em qualquer verificação
     * automática de layout: a tela fica certa a partir do segundo quadro.
     */
    const fonte = fonteDe("components/telao/PalcoTelao.tsx");
    expect(fonte).toMatch(/bgcolor:\s*"background\.default"/);
    expect(fonte).toMatch(/position:\s*"fixed"/);
    expect(fonte).toMatch(/inset:\s*0/);
  });

  it("usa `vw`, e nunca `cqw` — em produção não há contêiner declarado", () => {
    // A maquete usa `cqw` porque lá o telão é uma caixa dentro de uma página de
    // revisão. Aqui ele É a janela, e `cqw` sem contêiner não resolve: o texto
    // sairia no tamanho da página, 16 px numa parede de 3 metros.
    const arquivos = [
      "components/telao/PalcoTelao.tsx",
      "components/telao/TelaoDoSalao.tsx",
      "lib/theme-telao.ts",
    ];
    for (const arquivo of arquivos) {
      expect(fonteDe(arquivo), arquivo).not.toMatch(/\d(cqw|cqh|cqi|cqb)\b/);
    }
  });

  it("a margem segura de 5% está aplicada", () => {
    // Projetor e TV ainda cortam até 5% da borda. A foto pode sangrar; texto,
    // QR e a linha de marca, nunca.
    expect(escalaProjecao.margemSegura).toBe("5%");
    expect(fonteDe("components/telao/PalcoTelao.tsx")).toMatch(/margemSegura/);
  });
});

describe("as nove proibições da parede, no código", () => {
  const telao = fonteDe("components/telao/TelaoDoSalao.tsx");

  it("nenhum aviso técnico, esqueleto, spinner ou barra de progresso", () => {
    /**
     * H-12: o estado de erro é **invisível**. Uma mensagem de erro projetada num
     * casamento é incidente, não estado — e o `catch` da sondagem é vazio de
     * propósito, com o motivo escrito nele.
     */
    for (const proibido of [
      "CircularProgress",
      "LinearProgress",
      "Skeleton",
      "reconectando",
      "Reconectando",
      "Tentar de novo",
      "Erro",
      "erro ao",
    ]) {
      expect(telao, `"${proibido}" apareceu na parede`).not.toContain(proibido);
    }
  });

  it("nenhuma cor de estado, e nenhum `error`", () => {
    expect(telao).not.toMatch(/["']error\.[a-z]+["']/);
    expect(telao).not.toMatch(/["'](success|warning|info)\.[a-z]+["']/);
  });

  it("`object-fit: contain`, e nunca `cover`", () => {
    // `cover` corta rosto para 150 pessoas. Numa miniatura de grade cortar é
    // aceitável; numa parede, não é — e ninguém pode desfazer.
    expect(telao).toMatch(/objectFit:\s*"contain"/);
    expect(telao).not.toMatch(/objectFit:\s*"cover"/);
  });

  it("nada clicável: nenhum botão, nenhum link, nenhuma barra de navegação", () => {
    expect(telao).not.toMatch(/<Button/);
    expect(telao).not.toMatch(/onClick=/);
    expect(telao).not.toMatch(/<a\s/);
  });

  it("o monograma não entra na parede (§17.2, item 4)", () => {
    // Ele tem piso de 136 px de arquivo e **não existe medição em projeção**.
    // Projetar um traço de 1,9% da largura da tinta sem nunca ter medido ali é
    // apostar. A parede leva o nome do casal em TEXTO, que é maior e mais legível.
    expect(telao).not.toMatch(/monograma/i);
  });

  it("nenhuma variante fora das cinco da parede", () => {
    const usadas = [...telao.matchAll(/variant="([a-z0-9]+)"/g)].map(m => m[1]);
    for (const variante of usadas) {
      expect(
        VARIANTES_DO_TELAO as readonly string[],
        `variante "${variante}" não existe no telão (§14.4)`
      ).toContain(variante);
    }
  });

  it("nenhuma contagem de fotos na parede", () => {
    expect(telao).not.toMatch(/fotos novas|\bfotos\b\s*\}/);
  });

  it("`Convidado` não é escrito na parede — a ausência é a especificação", () => {
    // Um "Convidado" projetado em três metros nomeia a falta de nome, e a pessoa
    // que não se identificou não pediu para ser anunciada assim.
    expect(telao).not.toMatch(/"Convidado"/);
  });

  it("o telão NÃO ganha o par da janela (`gtm.md` §5.8)", () => {
    /**
     * Ele é a única superfície que não conta o estado do produto — nem erro, nem
     * carregando, nem janela. Quem olha para ele antes da festa é o casal
     * testando, e a resposta para o casal mora no painel, que é onde a janela foi
     * configurada e onde dá para corrigi-la.
     *
     * *Uma parede não é lugar de contar que o produto ainda não está no ar.*
     */
    expect(telao).not.toMatch(/EnvioIndisponivel|antes_da_janela|chegou antes/);
  });
});
