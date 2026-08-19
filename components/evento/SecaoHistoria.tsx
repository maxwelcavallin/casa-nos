import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { Historia } from "@/lib/conteudo-do-site";
import { paragrafos } from "@/lib/texto";

/**
 * A NOSSA HISTÓRIA (v1.0, V-07) — a única coisa do site que só o casal escreve.
 *
 * **A SEÇÃO INTEIRA SOME sem texto** (RV-02), como `SecaoIndicacoes` já fazia.
 * Uma seção vazia num convite não informa nada e ainda sugere que alguém
 * esqueceu de preencher.
 *
 * **TEXTO PURO** (RV-07): cada parágrafo é um `Typography`, e o React escapa o
 * conteúdo. Colar `<b>oi</b>` do WhatsApp mostra o `<b>oi</b>` escrito na tela.
 * Não há `dangerouslySetInnerHTML` em ponto nenhum deste produto — e é por isso
 * que não há sanitização: o que não é interpretado não precisa ser limpo.
 */
export function SecaoHistoria({ historia }: { historia: Historia | null }) {
  const blocos = historia ? paragrafos(historia.texto) : [];
  if (blocos.length === 0) return null;

  return (
    <Stack component="section" sx={{ gap: 2 }}>
      <Typography variant="overline" component="p" sx={{ color: "primary.dark" }}>
        A nossa história
      </Typography>

      {historia?.titulo ? (
        <Typography
          variant="h3"
          component="h2"
          sx={{ color: "text.primary", overflowWrap: "anywhere", textWrap: "balance" }}
        >
          {historia.titulo}
        </Typography>
      ) : null}

      <Stack sx={{ gap: 1.5 }}>
        {blocos.map((bloco, indice) => (
          <Typography
            // O índice como chave é seguro aqui: a lista é derivada do texto,
            // não tem identidade própria e é reconstruída inteira a cada carga.
            key={indice}
            variant="body1"
            sx={{ color: "text.primary", overflowWrap: "anywhere" }}
          >
            {bloco}
          </Typography>
        ))}
      </Stack>
    </Stack>
  );
}

export default SecaoHistoria;
