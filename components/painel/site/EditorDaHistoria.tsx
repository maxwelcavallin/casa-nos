"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { TETOS_DE_CONTEUDO } from "@/lib/conteudo-do-site";
import { toque } from "@/lib/tokens";
import { situacaoDoFormulario, useAvisoDeSaida } from "@/lib/usar-aviso-de-saida";
import { useSalvamento } from "@/lib/usar-salvamento";

/**
 * A NOSSA HISTÓRIA (v1.0, V-07).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **A CONTAGEM DE CARACTERES APARECE A PARTIR DE 200 RESTANTES**, e não desde o
 * primeiro toque. Um contador que fica piscando "1.187 restantes" enquanto a
 * pessoa escreve não informa nada e vira ruído; ele só passa a ser informação
 * quando o teto está perto.
 *
 * **E O CAMPO NÃO TRUNCA SOZINHO** (V-17). O `maxLength` saiu daqui de
 * propósito: com ele, colar do WhatsApp um texto de 1.300 caracteres joga fora
 * as últimas 100 letras **em silêncio** — o campo simplesmente para de aceitar,
 * sem mensagem, e a última frase da história do casal some sem ninguém ver. Sem
 * ele, o texto inteiro entra, a contagem fica vermelha dizendo quantos passaram,
 * e quem recusa é o servidor, com o número. Perder o fim de um texto colado é
 * exatamente o que esta história existe para impedir.
 *
 * **TEXTO PURO, e a tela diz isso**: parágrafo é linha em branco, e colar
 * `<b>oi</b>` do WhatsApp mostra o `<b>oi</b>` escrito no site. Dizer isso na
 * tela evita o caminho em que o casal formata o texto achando que funciona e só
 * descobre depois de publicar.
 *
 * **APAGAR O TEXTO APAGA A SEÇÃO**, e a tela avisa. É o estado ao qual o casal
 * precisa poder voltar — e ele é diferente de "seção mostrando uma caixa vazia".
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DadosDaHistoria = {
  eventoId: string;
  titulo: string;
  texto: string;
};

/** A partir de quantos caracteres restantes a contagem passa a aparecer. */
const AVISO_EM = 200;

export function EditorDaHistoria({ dados }: { dados: DadosDaHistoria }) {
  const [titulo, setTitulo] = useState(dados.titulo);
  const [texto, setTexto] = useState(dados.texto);
  /**
   * O QUE O SERVIDOR TEM (V-15). É contra isto que "alterado" é medido, e não
   * contra `dados`: depois de salvar, o servidor passa a ter o que está na tela,
   * e continuar comparando com o valor de montagem faria o aviso aparecer numa
   * tela sem nada por salvar.
   */
  const [gravado, setGravado] = useState({ titulo: dados.titulo, texto: dados.texto });
  const salvamento = useSalvamento();

  useAvisoDeSaida(situacaoDoFormulario({ titulo, texto }, gravado));

  const sobram = TETOS_DE_CONTEUDO.historiaTexto - texto.length;
  const vazio = texto.trim() === "";

  async function salvar() {
    const resultado = await salvamento.enviar(
      `/api/eventos/${dados.eventoId}/site/historia`,
      "PATCH",
      { titulo, texto }
    );
    if (resultado.ok) setGravado({ titulo, texto });
  }

  return (
    <Stack sx={{ gap: 2 }}>
      {salvamento.erroGeral ? <Alert severity="error">{salvamento.erroGeral}</Alert> : null}
      {salvamento.salvou ? (
        <Alert severity="success">
          {vazio
            ? "Texto apagado. A seção deixou de aparecer no site."
            : "Salvo. O site já mostra isto na próxima carga."}
        </Alert>
      ) : null}

      <Card sx={{ p: 2 }}>
        <Stack sx={{ gap: 2.5 }}>
          <TextField
            label="Título (opcional)"
            value={titulo}
            onChange={e => {
              setTitulo(e.target.value);
              salvamento.limpar();
            }}
            error={!!salvamento.erros.titulo}
            helperText={
              salvamento.erros.titulo ?? "Vazio, o site usa o título padrão da seção."
            }
            slotProps={{ htmlInput: { maxLength: TETOS_DE_CONTEUDO.historiaTitulo } }}
            fullWidth
          />

          <Stack sx={{ gap: 0.5 }}>
            <TextField
              label="Como vocês se conheceram"
              value={texto}
              onChange={e => {
                setTexto(e.target.value);
                salvamento.limpar();
              }}
              error={!!salvamento.erros.texto}
              helperText={
                salvamento.erros.texto ??
                "Deixe uma linha em branco entre os parágrafos. É texto puro: negrito e itálico não funcionam aqui."
              }
              multiline
              // A caixa nasce com a altura de leitura e cresce até um teto: sem
              // o teto, 1.200 caracteres empurram o botão de salvar para fora da
              // tela do celular, e o casal não acha mais como salvar.
              minRows={8}
              maxRows={20}
              fullWidth
            />

            {sobram <= AVISO_EM ? (
              <Typography
                variant="caption"
                sx={{ color: sobram <= 0 ? "error.main" : "warning.dark" }}
              >
                {sobram >= 0
                  ? `${sobram} caracteres até o limite`
                  : `${-sobram} caracteres acima do limite`}
              </Typography>
            ) : null}

            {vazio ? (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Sem texto, a seção não aparece no site.
              </Typography>
            ) : null}
          </Stack>
        </Stack>
      </Card>

      <Button
        variant="contained"
        onClick={salvar}
        disabled={salvamento.salvando}
        sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
      >
        {salvamento.salvando ? "Salvando…" : "Salvar a história"}
      </Button>
    </Stack>
  );
}

export default EditorDaHistoria;
