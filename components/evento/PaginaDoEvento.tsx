import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { HeroDoCasamento } from "@/components/evento/HeroDoCasamento";
import { RodapeDoCasamento } from "@/components/evento/RodapeDoCasamento";
import { SecaoHistoria } from "@/components/evento/SecaoHistoria";
import { SecaoIndicacoes } from "@/components/evento/SecaoIndicacoes";
import { SecaoOnde } from "@/components/evento/SecaoOnde";
import { SecaoPerguntas } from "@/components/evento/SecaoPerguntas";
import { SecaoProgramacao } from "@/components/evento/SecaoProgramacao";
import type { Historia, Momento, Pergunta } from "@/lib/conteudo-do-site";
import type { EventoPublico, Indicacao } from "@/lib/eventos";
import type { ChaveDeSecao } from "@/lib/secoes";
import { largura } from "@/lib/tokens";

/**
 * A página do casamento, montada. Um componente só, usado pelas duas rotas que
 * resolvem o evento (`/` pelo domínio, `/e/[slug]` pelo slug) — as rotas
 * decidem QUAL evento; esta decide como ele aparece.
 *
 * LARGURA TRATADA por teto centralizado: `largura.texto` (640) com `mx: "auto"`.
 * Sem teto, o `h1` do nome do casal estica 1900px num monitor e a linha fica
 * ilegível. É a regra §5 do padrão da casa, na forma que cabe a uma coluna de
 * leitura.
 *
 * MOBILE PRIMEIRO, e não por gosto: o convidado chega de um link no WhatsApp,
 * no celular, com uma mão. O desktop é o caso secundário.
 *
 * NÃO HÁ ESTADO DE CARREGAMENTO nesta página, e a ausência é deliberada: tudo é
 * renderizado no servidor, com os dados já em mãos. Não existe busca no cliente
 * que possa ficar pendurada, e portanto não existe esqueleto — um `Skeleton`
 * aqui seria enfeite que nunca aparece. Se a Fatia 1 trouxer busca no cliente, o
 * esqueleto entra junto com ela.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AS SEÇÕES SÃO DADO DESDE A v1.0 (V-03), e a lista chega pronta em `secoes`.
 *
 * **SEÇÃO DESLIGADA NÃO RENDERIZA E O CONTEÚDO DELA NÃO VIAJA NO HTML** (RV-01).
 * As duas metades importam, e a segunda é a que se esquece: quem chama esta
 * página **não busca** o conteúdo de uma seção desligada. "Não renderizar" não
 * esconde nada de quem abre o código-fonte, e é a mesma regra que
 * `recortePublico` já aplica ao nome do local que o casal ainda não divulgou.
 *
 * `capa` e `rodape` NÃO são condicionais: elas não podem ser desligadas
 * (RV-06), e escrever o `if` delas aqui daria a impressão de que podem.
 *
 * **SEÇÃO LIGADA E VAZIA TAMBÉM NÃO RENDERIZA** (RV-02). Isso não é decidido
 * aqui: cada componente de seção devolve `null` quando não tem o que mostrar, do
 * jeito que `SecaoIndicacoes` já fazia. A regra ficou onde estava o
 * comportamento, em vez de virar uma segunda lista de condições que se
 * desatualiza da primeira.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function PaginaDoEvento({
  evento,
  indicacoes,
  agoraMs,
  secoes,
  historia,
  programacao,
  perguntas,
}: {
  evento: EventoPublico;
  indicacoes: Indicacao[];
  agoraMs: number;
  /** As chaves LIGADAS, já na ordem do casal (`chavesLigadas` de lib/secoes.ts). */
  secoes: readonly ChaveDeSecao[];
  historia: Historia | null;
  programacao: Momento[];
  /** **Já filtradas**: pergunta sem resposta não chega aqui (RV-02, RV-01). */
  perguntas: Pergunta[];
}) {
  return (
    <>
      <GoogleAnalytics eventoId={evento.id} />
      <Box
        component="main"
        sx={{
          maxWidth: largura.texto,
          mx: "auto",
          px: { xs: 2, sm: 3 },
          pb: 4,
        }}
      >
        <Stack sx={{ gap: { xs: 6, md: 8 } }}>
          <HeroDoCasamento evento={evento} agoraMs={agoraMs} />

          {secoes
            .filter(chave => chave !== "capa" && chave !== "rodape")
            .map(chave => {
              // A ordem do casal é a ordem desta lista. Um `switch` por chave, e
              // não sete `&&` em sequência: com `&&` a ordem seria a do código, e
              // reordenar no painel não teria efeito nenhum no site.
              switch (chave) {
                case "onde":
                  return <SecaoOnde key={chave} evento={evento} />;
                case "programacao":
                  return <SecaoProgramacao key={chave} momentos={programacao} />;
                case "historia":
                  return <SecaoHistoria key={chave} historia={historia} />;
                case "perguntas":
                  return <SecaoPerguntas key={chave} perguntas={perguntas} />;
                case "indicacoes":
                  return (
                    <SecaoIndicacoes
                      key={chave}
                      indicacoes={indicacoes}
                      eventoId={evento.id}
                    />
                  );
                default:
                  // `capa` e `rodape` já saíram no `filter` acima. O `default`
                  // existe para o dia em que uma chave nova entrar no catálogo
                  // sem componente — e `test/secoes-catalogo.test.ts` quebra
                  // antes disso chegar ao site.
                  return null;
              }
            })}

          <RodapeDoCasamento evento={evento} />
        </Stack>
      </Box>
    </>
  );
}

export default PaginaDoEvento;
