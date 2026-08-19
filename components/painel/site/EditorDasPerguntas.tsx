"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { EstadoVazio } from "@/components/EstadoVazio";
import {
  MAXIMO_DE_PERGUNTAS,
  TETOS_DE_CONTEUDO,
  type Pergunta,
} from "@/lib/conteudo-do-site";
import { largura, toque } from "@/lib/tokens";
import { situacaoDoFormulario, useAvisoDeSaida } from "@/lib/usar-aviso-de-saida";
import { useSalvamento } from "@/lib/usar-salvamento";

/**
 * PERGUNTAS FREQUENTES (v1.0, V-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * As cinco que a Marina responde trinta vezes: **traje, horário, como chegar,
 * tem estacionamento, pode levar criança** (`pesquisa.md` §persona).
 *
 * **PERGUNTA SEM RESPOSTA NÃO VAI AO AR, E A TELA DIZ ISSO.** É a regra que
 * torna seguro sugerir as cinco (V-16): elas nascem sem resposta e ficam
 * invisíveis até serem respondidas. Sem o selo "sem resposta" nesta lista, o
 * casal acharia que publicou cinco perguntas em branco.
 *
 * **APAGAR A RESPOSTA É DIFERENTE DE APAGAR A PERGUNTA**: a primeira tira a
 * pergunta do site e a mantém aqui; a segunda apaga tudo, com confirmação que
 * nomeia a pergunta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DadosDasPerguntas = {
  eventoId: string;
  perguntas: Pergunta[];
};

const VAZIO = { pergunta: "", resposta: "" };

export function EditorDasPerguntas({ dados }: { dados: DadosDasPerguntas }) {
  const [perguntas, setPerguntas] = useState(dados.perguntas);
  const [emEdicao, setEmEdicao] = useState<string | null>(null);
  const [formulario, setFormulario] = useState(VAZIO);
  /** O formulário como ele estava ao abrir — a referência do aviso (V-15). */
  const [formularioBase, setFormularioBase] = useState(VAZIO);
  const [aApagar, setAApagar] = useState<Pergunta | null>(null);
  const salvamento = useSalvamento();

  const noTeto = perguntas.length >= MAXIMO_DE_PERGUNTAS;
  const semResposta = perguntas.filter(p => !p.resposta).length;

  /**
   * O AVISO DE SAÍDA DESTE EDITOR (V-15): há o que perder **enquanto o
   * formulário estiver aberto com conteúdo diferente do que ele tinha ao
   * abrir**. Fechar pelo "Cancelar" não avisa nada — ali a pessoa já disse que
   * está descartando.
   */
  useAvisoDeSaida(
    emEdicao === null ? "limpo" : situacaoDoFormulario(formulario, formularioBase)
  );

  /** Abrir o formulário é gravar o ponto de comparação junto. */
  function abrirFormulario(valores: typeof VAZIO) {
    setFormulario(valores);
    setFormularioBase(valores);
  }

  function abrirNovo() {
    setEmEdicao("novo");
    abrirFormulario(VAZIO);
    salvamento.limpar();
  }

  function abrirEdicao(item: Pergunta) {
    setEmEdicao(item.id);
    abrirFormulario({ pergunta: item.pergunta, resposta: item.resposta ?? "" });
    salvamento.limpar();
  }

  function mudar<C extends keyof typeof formulario>(campo: C, valor: string) {
    setFormulario(atual => ({ ...atual, [campo]: valor }));
    salvamento.limpar();
  }

  async function salvar() {
    const novo = emEdicao === "novo";
    const resultado = await salvamento.enviar(
      novo
        ? `/api/eventos/${dados.eventoId}/site/perguntas`
        : `/api/eventos/${dados.eventoId}/site/perguntas/${emEdicao}`,
      novo ? "POST" : "PATCH",
      {
        pergunta: formulario.pergunta,
        // Vazio vira `null`: é o estado "sugerida, ainda não respondida", e é
        // ele que mantém a pergunta fora do site.
        resposta: formulario.resposta.trim() === "" ? null : formulario.resposta,
      }
    );
    if (!resultado.ok) return;

    const guardada = resultado.corpo as Pergunta;
    setPerguntas(atual =>
      novo ? [...atual, guardada] : atual.map(p => (p.id === guardada.id ? guardada : p))
    );
    setEmEdicao(null);
  }

  async function apagar(item: Pergunta) {
    setAApagar(null);
    const antes = perguntas;
    setPerguntas(atual => atual.filter(p => p.id !== item.id));
    const resultado = await salvamento.enviar(
      `/api/eventos/${dados.eventoId}/site/perguntas/${item.id}`,
      "DELETE"
    );
    if (!resultado.ok) setPerguntas(antes);
  }

  const emFormulario = emEdicao !== null;

  return (
    <Stack sx={{ gap: 2 }}>
      {salvamento.erroGeral ? <Alert severity="error">{salvamento.erroGeral}</Alert> : null}

      {perguntas.length > 0 && semResposta > 0 ? (
        <Alert severity="info">
          {semResposta === 1
            ? "Uma pergunta está sem resposta e não aparece no site."
            : `${semResposta} perguntas estão sem resposta e não aparecem no site.`}
        </Alert>
      ) : null}

      {perguntas.length === 0 && !emFormulario ? (
        <EstadoVazio
          titulo="Nenhuma pergunta ainda"
          corpo="Enquanto estiver vazia, a seção não aparece no site. As que mais chegam são traje, horário, como chegar, estacionamento e criança."
          acao={
            <Button
              variant="contained"
              onClick={abrirNovo}
              sx={{ minHeight: toque.confortavel }}
            >
              Escrever a primeira
            </Button>
          }
        />
      ) : null}

      {perguntas.length > 0 ? (
        <Card>
          <Stack divider={<Divider />}>
            {perguntas.map(item => (
              <Stack
                key={item.id}
                direction={{ xs: "column", sm: "row" }}
                sx={{ gap: 1.5, px: 2, py: 2, alignItems: { xs: "stretch", sm: "center" } }}
              >
                <Stack sx={{ gap: 0.5, flex: 1, minWidth: 0 }}>
                  <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="subtitle1" component="h2">
                      {item.pergunta}
                    </Typography>
                    {!item.resposta ? (
                      /* Cor não é o único sinal: o estado tem rótulo escrito. */
                      <Chip size="small" color="warning" label="sem resposta" />
                    ) : null}
                  </Stack>
                  {item.resposta ? (
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                    >
                      {item.resposta}
                    </Typography>
                  ) : (
                    <Typography variant="body2" sx={{ color: "text.disabled" }}>
                      Não aparece no site enquanto não for respondida.
                    </Typography>
                  )}
                </Stack>

                <Stack direction="row" sx={{ gap: 1 }}>
                  <Button
                    onClick={() => abrirEdicao(item)}
                    disabled={salvamento.salvando}
                    sx={{ minHeight: toque.minimo }}
                  >
                    {item.resposta ? "Editar" : "Responder"}
                  </Button>
                  <Button
                    color="error"
                    onClick={() => setAApagar(item)}
                    disabled={salvamento.salvando}
                    sx={{ minHeight: toque.minimo }}
                  >
                    Apagar
                  </Button>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Card>
      ) : null}

      {emFormulario ? (
        <Card sx={{ p: 2 }}>
          <Stack sx={{ gap: 2.5 }}>
            <TextField
              label="Pergunta"
              value={formulario.pergunta}
              onChange={e => mudar("pergunta", e.target.value)}
              error={!!salvamento.erros.pergunta}
              helperText={salvamento.erros.pergunta}
              slotProps={{ htmlInput: { maxLength: TETOS_DE_CONTEUDO.pergunta } }}
              fullWidth
              autoFocus
            />
            <TextField
              label="Resposta"
              value={formulario.resposta}
              onChange={e => mudar("resposta", e.target.value)}
              error={!!salvamento.erros.resposta}
              helperText={
                salvamento.erros.resposta ??
                "Em branco, a pergunta fica guardada aqui e não aparece no site."
              }
              slotProps={{ htmlInput: { maxLength: TETOS_DE_CONTEUDO.resposta } }}
              multiline
              minRows={3}
              fullWidth
            />

            <Stack direction="row" sx={{ gap: 1 }}>
              <Button
                variant="contained"
                onClick={salvar}
                disabled={salvamento.salvando}
                sx={{ minHeight: toque.confortavel }}
              >
                {salvamento.salvando ? "Salvando…" : "Salvar"}
              </Button>
              <Button
                onClick={() => setEmEdicao(null)}
                disabled={salvamento.salvando}
                sx={{ minHeight: toque.confortavel }}
              >
                Cancelar
              </Button>
            </Stack>
          </Stack>
        </Card>
      ) : (
        <Stack sx={{ gap: 0.5, alignItems: "flex-start" }}>
          <Button
            variant={perguntas.length === 0 ? "text" : "contained"}
            onClick={abrirNovo}
            disabled={noTeto || salvamento.salvando}
            sx={{ minHeight: toque.confortavel }}
          >
            Escrever outra
          </Button>
          {noTeto ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Vocês chegaram a {MAXIMO_DE_PERGUNTAS} perguntas. Apague uma para pôr
              outra.
            </Typography>
          ) : null}
        </Stack>
      )}

      <Dialog
        open={aApagar !== null}
        onClose={() => setAApagar(null)}
        slotProps={{ paper: { sx: { maxWidth: largura.dialogo } } }}
      >
        <DialogTitle>Apagar “{aApagar?.pergunta}”?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            A pergunta e a resposta somem daqui e do site. Se você só quer tirá-la
            do site, apague a resposta em vez de apagar a pergunta.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAApagar(null)} sx={{ minHeight: toque.minimo }}>
            Deixar como está
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => aApagar && apagar(aApagar)}
            sx={{ minHeight: toque.minimo }}
          >
            Apagar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default EditorDasPerguntas;
