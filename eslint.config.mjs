import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"

/**
 * Régua de lint do casa-nos.
 *
 * Diferente do projeto vizinho, este nasce com as regras de design system já
 * como ERRO, e não em modo aviso. O motivo é aritmético: um projeto novo tem
 * zero violações, e uma regra que acusa zero erros no dia em que nasce é uma
 * regra que ninguém precisa desligar. Foi por ter esperado que o outro produto
 * chegou a 2.842 cores literais em 116 tons — cada tela pegando o tom "quase
 * certo" mais próximo, ninguém decidindo nada.
 *
 * O que NÃO está aqui está em `scripts/ds-check.mjs` (contagem, roda no build) e
 * em `test/` (varredura de rota). Regra escrita não segura nada; catraca segura.
 */
const configuracao = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"],
  },

  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    rules: {
      // O TypeScript já cobre isto, e melhor.
      "no-undef": "off",

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // `any` num projeto de 30 arquivos é escolha, não herança.
      "@typescript-eslint/no-explicit-any": "error",

      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mui/material/*/*"],
              message:
                "Importe de '@mui/material' ou de '@mui/material/Componente'. Caminho mais fundo é interno e quebra entre versões.",
            },
            /**
             * `components/ui/` é o resquício do shadcn. A pasta não nasce neste
             * projeto, e a regra existe para que ela não nasça por descuido —
             * bastam duas telas com um `Button` próprio para o MUI virar
             * decoração e o tema parar de valer.
             */
            {
              group: ["@/components/ui", "@/components/ui/*"],
              message:
                "components/ui/ é proibido (padrão da casa). Componente visual vem do MUI; o que não existe lá nasce em components/<dominio>/.",
            },
          ],
        },
      ],
    },
  },

  /**
   * COR LITERAL É ERRO — em `app/` e `components/`, e só neles.
   *
   * O escopo é esse de propósito: `lib/tokens.ts` É a paleta, e é o único lugar
   * do projeto onde um `#hex` significa alguma coisa. Proibir lá seria proibir
   * a própria fonte.
   *
   * Comentário não é `Literal` na árvore, então comentário que registra a cor
   * de um bug antigo continua permitido — documentar o desvio não é cometê-lo.
   *
   * Pega os dois jeitos de escrever: `"#F5EAE9"` numa prop ou num `sx`, e
   * `` `1px solid #ccc` `` num template. Olha o VALOR, então cobre `className`,
   * `style` e `sx` sem precisar nomear cada um.
   */
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\\b/]",
          message:
            "Cor literal. Ela vem de lib/tokens.ts — no MUI por sx={{ color: 'text.secondary' }}, no CSS por var(--cn-*). Se o tom que você quer não existe lá, ele nasce lá primeiro.",
        },
        {
          selector:
            "TemplateElement[value.raw=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\\b/]",
          message:
            "Cor literal dentro de template. Use o token de lib/tokens.ts — `1px solid ${cor.divider}`, não `1px solid #E4DACD`.",
        },
        {
          selector: "Literal[value=/\\b(rgb|rgba|hsl|hsla)\\(/]",
          message:
            "Cor literal em rgb()/hsl(). Ela vem de lib/tokens.ts. O único rgba() legítimo do projeto é `cor.overlay`, e ele já mora lá.",
        },
      ],
    },
  },

  /**
   * TEXTO PURO, E A CATRACA QUE O SEGURA (v1.0, V-14).
   *
   * Todo texto do casal é texto puro: parágrafo é linha em branco, e colar
   * `<b>oi</b>` do WhatsApp mostra o `<b>oi</b>` escrito. **Não existe
   * `dangerouslySetInnerHTML` em ponto nenhum deste produto — e por isso não
   * existe sanitização: o que não é interpretado não precisa ser limpo.**
   *
   * O par é que importa. Uma tela que interpreta HTML transforma toda a ausência
   * de sanitização do produto — que hoje é decisão coerente — num buraco, e o
   * caminho até lá é curto: alguém quer negrito na história do casal e resolve
   * em uma linha. Como regra escrita, isso já está no README; aqui vira erro de
   * lint, que é o que quebra o `pnpm verificar`.
   *
   * A regra vale em `app/` e `components/`, que é onde HTML se renderiza. Um
   * teste que varresse o disco pegaria a mesma coisa mais tarde e com mensagem
   * pior — o lint acusa no editor, antes do commit.
   */
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "react/no-danger": "error",
    },
  },

  // Scripts de manutenção rodam no Node, fora do bundle: `console` é a interface
  // deles, e eles não passam pelo tsconfig do app.
  {
    files: ["scripts/**/*.{js,mjs}", "*.config.{js,mjs,mts}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]

export default configuracao
