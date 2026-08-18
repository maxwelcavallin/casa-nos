import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Setup dos testes que renderizam tela.
 *
 * `matchMedia` não existe no jsdom, e o MUI o consulta em qualquer componente
 * responsivo. Sem este remendo, a primeira tela com breakpoint estoura com
 * "matchMedia is not a function" — e o erro não aponta para o MUI, aponta para
 * a tela, o que manda quem investiga para o lugar errado.
 */
if (!window.matchMedia) {
  window.matchMedia = (consulta: string) =>
    ({
      matches: false,
      media: consulta,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

afterEach(() => cleanup());
