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
import { MAXIMO_DE_MOMENTOS, TETOS_DE_CONTEUDO, type Momento } from "@/lib/conteudo-do-site";
import { horaParaExibir } from "@/lib/datas";
import { largura, toque } from "@/lib/tokens";
import { situacaoDoFormulario, useAvisoDeSaida } from "@/lib/usar-aviso-de-saida";
import { useSalvamento } from "@/lib/usar-salvamento";

/**
 * A PROGRAMAÇÃO DO DIA (v1.0, V-08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **MOMENTO SEM HORA NÃO MOSTRA `--:--` NEM `00:00`** — nem aqui, nem no site. A
 * interface diz o que a ausência significa ("sem horário anunciado"), porque
 * "a festa vai até o fim" é um momento legítimo e não um campo esquecido.
 *
 * A hora é `time` e viaja como `"16:00"`. Ela **não passa por `Date`** (RV-10):
 * é hora de relógio de parede no dia do evento, e transformá-la em instante
 * traria de volta o bug de três horas — 23:30 viraria 02:30 do dia seguinte.
 *
 * Exclusão lógica, com confirmação que **nomeia o momento**.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DadosDaProgramacao = {
  eventoId: string;
  momentos: Momento[];
};

const VAZIO = { hora: "", titulo: "", descricao: "" };

export function EditorDaProgramacao({ dados }: { dados: DadosDaProgramacao }) {
  const [momentos, setMomentos] = useState(dados.momentos);
  const [emEdicao, setEmEdicao] = useState<string | null>(null);
  const [formulario, setFormulario] = useState(VAZIO);
  /** O formulário como ele estava ao abrir — a referência do aviso (V-15). */
  const [formularioBase, setFormularioBase] = useState(VAZIO);
  const [aApagar, setAApagar] = useState<Momento | null>(null);
  const salvamento = useSalvamento();

  const noTeto = momentos.length >= MAXIMO_DE_MOMENTOS;

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

  function abrirEdicao(momento: Momento) {
    setEmEdicao(momento.id);
    abrirFormulario({
      hora: momento.hora ?? "",
      titulo: momento.titulo,
      descricao: momento.descricao ?? "",
    });
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
        ? `/api/eventos/${dados.eventoId}/site/programacao`
        : `/api/eventos/${dados.eventoId}/site/programacao/${emEdicao}`,
      novo ? "POST" : "PATCH",
      {
        // Vazio vira `null`, e não `""`: nulo significa "sem horário anunciado",
        // e é o estado que o casal precisa poder escolher.
        hora: formulario.hora.trim() === "" ? null : formulario.hora,
        titulo: formulario.titulo,
        descricao: formulario.descricao.trim() === "" ? null : formulario.descricao,
      }
    );
    if (!resultado.ok) return;

    const guardado = resultado.corpo as Momento;
    setMomentos(atual =>
      novo ? [...atual, guardado] : atual.map(m => (m.id === guardado.id ? guardado : m))
    );
    setEmEdicao(null);
  }

  async function apagar(momento: Momento) {
    setAApagar(null);
    const antes = momentos;
    setMomentos(atual => atual.filter(m => m.id !== momento.id));
    const resultado = await salvamento.enviar(
      `/api/eventos/${dados.eventoId}/site/programacao/${momento.id}`,
      "DELETE"
    );
    if (!resultado.ok) setMomentos(antes);
  }

  const emFormulario = emEdicao !== null;

  return (
    <Stack sx={{ gap: 2 }}>
      {salvamento.erroGeral ? <Alert severity="error">{salvamento.erroGeral}</Alert> : null}

      {momentos.length === 0 && !emFormulario ? (
        <EstadoVazio
          titulo="Nenhum momento ainda"
          corpo="Enquanto estiver vazia, a seção não aparece no site. Cerimônia, coquetel, festa — os horários que os convidados perguntam."
          acao={
            <Button
              variant="contained"
              onClick={abrirNovo}
              sx={{ minHeight: toque.confortavel }}
            >
              Cadastrar o primeiro
            </Button>
          }
        />
      ) : null}

      {momentos.length > 0 ? (
        <Card>
          <Stack divider={<Divider />}>
            {momentos.map(momento => (
              <Stack
                key={momento.id}
                direction={{ xs: "column", sm: "row" }}
                sx={{ gap: 1.5, px: 2, py: 2, alignItems: { xs: "stretch", sm: "center" } }}
              >
                <Stack sx={{ gap: 0.5, flex: 1, minWidth: 0 }}>
                  <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="subtitle1" component="h2">
                      {momento.titulo}
                    </Typography>
                    {momento.hora ? (
                      <Chip size="small" label={horaParaExibir(momento.hora)} />
                    ) : (
                      /* NÃO é `--:--`: o rótulo diz o que a ausência significa. */
                      <Chip size="small" variant="outlined" label="sem horário anunciado" />
                    )}
                  </Stack>
                  {momento.descricao ? (
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                    >
                      {momento.descricao}
                    </Typography>
                  ) : null}
                </Stack>

                <Stack direction="row" sx={{ gap: 1 }}>
                  <Button
                    onClick={() => abrirEdicao(momento)}
                    disabled={salvamento.salvando}
                    sx={{ minHeight: toque.minimo }}
                  >
                    Editar
                  </Button>
                  <Button
                    color="error"
                    onClick={() => setAApagar(momento)}
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
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
              <TextField
                label="Horário"
                type="time"
                value={formulario.hora}
                onChange={e => mudar("hora", e.target.value)}
                error={!!salvamento.erros.hora}
                helperText={
                  salvamento.erros.hora ??
                  "Em branco, o site mostra o momento sem horário."
                }
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="O que acontece"
                value={formulario.titulo}
                onChange={e => mudar("titulo", e.target.value)}
                error={!!salvamento.erros.titulo}
                helperText={salvamento.erros.titulo}
                slotProps={{
                  htmlInput: { maxLength: TETOS_DE_CONTEUDO.momentoTitulo },
                }}
                sx={{ flex: 2 }}
                autoFocus
              />
            </Stack>

            <TextField
              label="Detalhe (opcional)"
              value={formulario.descricao}
              onChange={e => mudar("descricao", e.target.value)}
              error={!!salvamento.erros.descricao}
              helperText={salvamento.erros.descricao}
              slotProps={{
                htmlInput: { maxLength: TETOS_DE_CONTEUDO.momentoDescricao },
              }}
              multiline
              minRows={2}
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
      ) : momentos.length > 0 ? (
        /**
         * **O BOTÃO DE BAIXO SÓ EXISTE COM A momentos CHEIA** (v1.0, acabamento).
         *
         * Com a lista vazia, quem convida a escrever é o estado vazio, que já
         * diz a consequência de a seção continuar assim. Os dois juntos são dois
         * botões para a mesma ação a dois centímetros de distância — e o de
         * baixo ainda dizia "outra", numa tela onde não existe nenhuma.
         */
        <Stack sx={{ gap: 0.5, alignItems: "flex-start" }}>
          <Button
            variant="contained"
            onClick={abrirNovo}
            disabled={noTeto || salvamento.salvando}
            sx={{ minHeight: toque.confortavel }}
          >
            Cadastrar outro
          </Button>
          {noTeto ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Vocês chegaram a {MAXIMO_DE_MOMENTOS} momentos. Acima disso a seção
              vira agenda, e ninguém lê no celular.
            </Typography>
          ) : null}
        </Stack>
      ) : null}

      <Dialog
        open={aApagar !== null}
        onClose={() => setAApagar(null)}
        slotProps={{ paper: { sx: { maxWidth: largura.dialogo } } }}
      >
        {/* A pergunta NOMEIA o momento. "Tem certeza?" numa lista de doze linhas
            parecidas não é pergunta, é um botão a mais no caminho de apagar o
            item errado. */}
        <DialogTitle>Apagar {aApagar?.titulo}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Ele sai do site na próxima carga. Se este for o único, a seção inteira
            deixa de aparecer.
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

export default EditorDaProgramacao;
