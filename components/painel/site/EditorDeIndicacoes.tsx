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
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { EstadoVazio } from "@/components/EstadoVazio";
import { MAXIMO_DE_INDICACOES, TETOS } from "@/lib/indicacoes";
import { largura, toque } from "@/lib/tokens";
import { situacaoDoFormulario, useAvisoDeSaida } from "@/lib/usar-aviso-de-saida";
import { useSalvamento } from "@/lib/usar-salvamento";

/**
 * ONDE FICAR E DICAS (v1.0, V-06).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A seção já renderiza em produção desde a Fatia 0; o que não existia era o
 * editor. Ela some inteira quando não há item — e **o estado vazio desta tela diz
 * essa consequência**, em vez de só nomear a ausência: "enquanto estiver vazio, a
 * seção não aparece no site". Sem a frase, o casal cadastra um hotel para testar
 * e não entende por que a seção sumiu quando ele apagou.
 *
 * **A CONFIRMAÇÃO DE APAGAR NOMEIA O ITEM** ("Apagar o Hotel Vermont?"), e não
 * "Tem certeza?". Numa lista de vinte cartões parecidos, "tem certeza" não é
 * pergunta — é um botão a mais no caminho de apagar o item errado.
 *
 * A exclusão é **lógica**: é conteúdo que o casal escreveu.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ItemDeIndicacao = {
  id: string;
  tipo: "hospedagem" | "dica";
  titulo: string;
  referencia: string | null;
  descricao: string | null;
  url: string | null;
  ordem: number;
};

export type DadosDasIndicacoes = {
  eventoId: string;
  indicacoes: ItemDeIndicacao[];
};

const VAZIO = {
  tipo: "hospedagem" as "hospedagem" | "dica",
  titulo: "",
  referencia: "",
  descricao: "",
  url: "",
};

export function EditorDeIndicacoes({ dados }: { dados: DadosDasIndicacoes }) {
  const [itens, setItens] = useState(dados.indicacoes);
  const [emEdicao, setEmEdicao] = useState<string | null>(null);
  const [formulario, setFormulario] = useState(VAZIO);
  /** O formulário como ele estava ao abrir — a referência do aviso (V-15). */
  const [formularioBase, setFormularioBase] = useState(VAZIO);
  const [aApagar, setAApagar] = useState<ItemDeIndicacao | null>(null);
  const salvamento = useSalvamento();

  const noTeto = itens.length >= MAXIMO_DE_INDICACOES;

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

  function abrirEdicao(item: ItemDeIndicacao) {
    setEmEdicao(item.id);
    abrirFormulario({
      tipo: item.tipo,
      titulo: item.titulo,
      referencia: item.referencia ?? "",
      descricao: item.descricao ?? "",
      url: item.url ?? "",
    });
    salvamento.limpar();
  }

  function mudar<C extends keyof typeof formulario>(
    campo: C,
    valor: (typeof formulario)[C]
  ) {
    setFormulario(atual => ({ ...atual, [campo]: valor }));
    salvamento.limpar();
  }

  async function salvar() {
    const corpo = {
      tipo: formulario.tipo,
      titulo: formulario.titulo,
      // Campo vazio viaja como `null` e não como `""`: limpar o link é uma
      // edição legítima, e a rota distingue as duas coisas.
      referencia: formulario.referencia.trim() === "" ? null : formulario.referencia,
      descricao: formulario.descricao.trim() === "" ? null : formulario.descricao,
      url: formulario.url.trim() === "" ? null : formulario.url,
    };

    const novo = emEdicao === "novo";
    const resultado = await salvamento.enviar(
      novo
        ? `/api/eventos/${dados.eventoId}/site/indicacoes`
        : `/api/eventos/${dados.eventoId}/site/indicacoes/${emEdicao}`,
      novo ? "POST" : "PATCH",
      corpo
    );
    if (!resultado.ok) return;

    const guardado = resultado.corpo as ItemDeIndicacao;
    setItens(atual =>
      novo
        ? [...atual, guardado]
        : atual.map(i => (i.id === guardado.id ? guardado : i))
    );
    setEmEdicao(null);
  }

  async function apagar(item: ItemDeIndicacao) {
    setAApagar(null);
    const antes = itens;
    setItens(atual => atual.filter(i => i.id !== item.id));
    const resultado = await salvamento.enviar(
      `/api/eventos/${dados.eventoId}/site/indicacoes/${item.id}`,
      "DELETE"
    );
    // Reversão com mensagem específica: a lista volta ao que era, e a frase diz
    // que o item continua lá — não "erro ao apagar".
    if (!resultado.ok) setItens(antes);
  }

  const emFormulario = emEdicao !== null;

  return (
    <Stack sx={{ gap: 2 }}>
      {salvamento.erroGeral ? <Alert severity="error">{salvamento.erroGeral}</Alert> : null}

      {itens.length === 0 && !emFormulario ? (
        <EstadoVazio
          titulo="Nenhuma indicação ainda"
          corpo="Enquanto estiver vazio, a seção não aparece no site. Cadastre os hotéis e as dicas que vocês recomendam para quem vem de fora."
          acao={
            <Button
              variant="contained"
              onClick={abrirNovo}
              sx={{ minHeight: toque.confortavel }}
            >
              Cadastrar a primeira
            </Button>
          }
        />
      ) : null}

      {itens.length > 0 ? (
        <Card>
          <Stack divider={<Divider />}>
            {itens.map(item => (
              <Stack
                key={item.id}
                direction={{ xs: "column", sm: "row" }}
                sx={{ gap: 1.5, px: 2, py: 2, alignItems: { xs: "stretch", sm: "center" } }}
              >
                <Stack sx={{ gap: 0.5, flex: 1, minWidth: 0 }}>
                  <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="subtitle1" component="h2">
                      {item.titulo}
                    </Typography>
                    {/* O tipo tem rótulo escrito, não só uma cor (régua §10). */}
                    <Chip
                      size="small"
                      label={item.tipo === "hospedagem" ? "hospedagem" : "dica"}
                    />
                  </Stack>
                  {item.referencia ? (
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {item.referencia}
                    </Typography>
                  ) : null}
                  {item.descricao ? (
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                    >
                      {item.descricao}
                    </Typography>
                  ) : null}
                </Stack>

                <Stack direction="row" sx={{ gap: 1 }}>
                  <Button
                    onClick={() => abrirEdicao(item)}
                    disabled={salvamento.salvando}
                    sx={{ minHeight: toque.minimo }}
                  >
                    Editar
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
            <RadioGroup
              row
              value={formulario.tipo}
              onChange={e => mudar("tipo", e.target.value as "hospedagem" | "dica")}
            >
              <FormControlLabel value="hospedagem" control={<Radio />} label="Hospedagem" />
              <FormControlLabel value="dica" control={<Radio />} label="Dica da cidade" />
            </RadioGroup>

            <TextField
              label="Nome"
              value={formulario.titulo}
              onChange={e => mudar("titulo", e.target.value)}
              error={!!salvamento.erros.titulo}
              helperText={salvamento.erros.titulo}
              slotProps={{ htmlInput: { maxLength: TETOS.titulo } }}
              fullWidth
              autoFocus
            />

            <TextField
              label="Referência"
              value={formulario.referencia}
              onChange={e => mudar("referencia", e.target.value)}
              error={!!salvamento.erros.referencia}
              helperText={
                salvamento.erros.referencia ?? "Distância ou bairro: “8 min do local”, “Leblon”."
              }
              slotProps={{ htmlInput: { maxLength: TETOS.referencia } }}
              fullWidth
            />

            <TextField
              label="Descrição"
              value={formulario.descricao}
              onChange={e => mudar("descricao", e.target.value)}
              error={!!salvamento.erros.descricao}
              helperText={salvamento.erros.descricao}
              slotProps={{ htmlInput: { maxLength: TETOS.descricao } }}
              multiline
              minRows={2}
              fullWidth
            />

            <TextField
              label="Link"
              value={formulario.url}
              onChange={e => mudar("url", e.target.value)}
              error={!!salvamento.erros.url}
              helperText={
                salvamento.erros.url ?? "Começando com https://. Abre em outra aba no site."
              }
              slotProps={{ htmlInput: { maxLength: TETOS.url, inputMode: "url" } }}
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
      ) : itens.length > 0 ? (
        /**
         * **O BOTÃO DE BAIXO SÓ EXISTE COM A itens CHEIA** (v1.0, acabamento).
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
            Cadastrar outra
          </Button>
          {noTeto ? (
            // A razão escrita ao lado do botão desabilitado. Um botão apagado sem
            // motivo é um defeito, do ponto de vista de quem olha.
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Vocês chegaram a {MAXIMO_DE_INDICACOES} indicações. Apague uma para pôr outra.
            </Typography>
          ) : null}
        </Stack>
      ) : null}

      <Dialog
        open={aApagar !== null}
        onClose={() => setAApagar(null)}
        slotProps={{ paper: { sx: { maxWidth: largura.dialogo } } }}
      >
        <DialogTitle>Apagar {aApagar?.titulo}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Ela sai do site na próxima carga. Se esta for a única, a seção inteira
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

export default EditorDeIndicacoes;
