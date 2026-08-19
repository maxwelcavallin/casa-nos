"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { situacaoDoFormulario, useAvisoDeSaida } from "@/lib/usar-aviso-de-saida";
import { useSalvamento } from "@/lib/usar-salvamento";
import { TETOS_DO_EVENTO } from "@/lib/site-evento";
import { toque } from "@/lib/tokens";

/**
 * A CAPA — quem casa e quando (v1.0, V-04).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **É AQUI QUE O CASAL PARA DE DEPENDER DE ALGUÉM ABRIR UM TERMINAL.** Até esta
 * tela, corrigir o nome ou o horário significava editar
 * `db/seed/casamento-ana-e-max.json` e rodar `pnpm db:seed`.
 *
 * O CAMPO DE DATA É `type="date"` E O DE HORA É `type="time"`, e os dois falam
 * **string** com o servidor: `"2027-08-22"` e `"16:00"`. Nenhum deles passa por
 * `Date` em canto nenhum (RV-10) — `new Date("2027-08-22")` é meia-noite em UTC,
 * 21h do dia 21 em Brasília, e o site anunciaria a data errada do casamento.
 *
 * **"ANUNCIAR O HORÁRIO" É UMA FLAG SEPARADA**, e não a presença do campo. O
 * casal preenche o horário meses antes de divulgá-lo, e a contagem regressiva
 * persegue o começo do dia enquanto ele não for anunciado. Tentar ligar a flag
 * sem horário responde 400 com a frase **no campo do horário**, que é onde a
 * pessoa precisa digitar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DadosDaCapa = {
  eventoId: string;
  nomeCasal: string;
  /** `AAAA-MM-DD`, do jeito que a coluna `date` devolve. */
  dataEvento: string;
  /** `HH:MM`, ou vazio quando ainda não há horário definido. */
  horaEvento: string;
  horaPublicada: boolean;
  cidade: string;
  uf: string;
};

export function EditorDaCapa({ dados }: { dados: DadosDaCapa }) {
  const [campos, setCampos] = useState({
    nome_casal: dados.nomeCasal,
    data_evento: dados.dataEvento,
    hora_evento: dados.horaEvento,
    hora_publicada: dados.horaPublicada,
    cidade: dados.cidade,
    uf: dados.uf,
  });
  /** O que o servidor tem — a referência do aviso de saída (V-15). */
  const [gravado, setGravado] = useState({
    nome_casal: dados.nomeCasal,
    data_evento: dados.dataEvento,
    hora_evento: dados.horaEvento,
    hora_publicada: dados.horaPublicada,
    cidade: dados.cidade,
    uf: dados.uf,
  });
  const salvamento = useSalvamento();

  useAvisoDeSaida(situacaoDoFormulario(campos, gravado));

  function mudar<C extends keyof typeof campos>(campo: C, valor: (typeof campos)[C]) {
    setCampos(atual => ({ ...atual, [campo]: valor }));
    salvamento.limpar();
  }

  async function salvar() {
    const resultado = await salvamento.enviar(
      `/api/eventos/${dados.eventoId}/site/evento`,
      "PATCH",
      campos
    );
    if (resultado.ok) setGravado(campos);
  }

  const sobramNoNome = TETOS_DO_EVENTO.nomeCasal - campos.nome_casal.length;

  return (
    <Stack sx={{ gap: 2 }}>
      {salvamento.erroGeral ? (
        <Alert severity="error">{salvamento.erroGeral}</Alert>
      ) : null}
      {salvamento.salvou ? (
        <Alert severity="success">Salvo. O site já mostra isto na próxima carga.</Alert>
      ) : null}

      <Card sx={{ p: 2 }}>
        <Stack sx={{ gap: 2.5 }}>
          <Stack sx={{ gap: 0.5 }}>
            <TextField
              // `label` de verdade, e não `placeholder`: placeholder some quando
              // a pessoa digita, e some justamente quando ela precisa conferir.
              label="Como vocês aparecem no site"
              value={campos.nome_casal}
              onChange={e => mudar("nome_casal", e.target.value)}
              error={!!salvamento.erros.nome_casal}
              helperText={salvamento.erros.nome_casal}
              fullWidth
            />
            <Typography
              variant="caption"
              sx={{
                color:
                  sobramNoNome < 0
                    ? "error.main"
                    : sobramNoNome <= 10
                      ? "warning.dark"
                      : "text.secondary",
              }}
            >
              {/* 60 caracteres é o pior caso que o design system manda testar no
                  `h1` a 360 px. A contagem aparece sempre neste campo porque ele
                  é curto e a régua é apertada.

                  O campo NÃO trunca (V-17): passar do teto fica vermelho e o
                  servidor recusa com o número. Um campo que para de aceitar
                  letra no meio de um nome colado não diz o que houve. */}
              {sobramNoNome >= 0
                ? `${sobramNoNome} de ${TETOS_DO_EVENTO.nomeCasal} caracteres sobrando`
                : `${-sobramNoNome} caracteres acima do limite`}
            </Typography>
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
            <TextField
              label="Data do casamento"
              type="date"
              value={campos.data_evento}
              onChange={e => mudar("data_evento", e.target.value)}
              error={!!salvamento.erros.data_evento}
              helperText={salvamento.erros.data_evento}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Horário"
              type="time"
              value={campos.hora_evento}
              onChange={e => mudar("hora_evento", e.target.value)}
              error={!!salvamento.erros.hora_evento}
              helperText={
                salvamento.erros.hora_evento ??
                "Dá para deixar em branco enquanto vocês não fecharam."
              }
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1 }}
            />
          </Stack>

          <Stack sx={{ gap: 0.5 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={campos.hora_publicada}
                  onChange={e => mudar("hora_publicada", e.target.checked)}
                />
              }
              label="Anunciar o horário no site"
            />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Desligado, o site não mostra horário nenhum e a contagem regressiva
              persegue o começo do dia.
            </Typography>
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
            <TextField
              label="Cidade"
              value={campos.cidade}
              onChange={e => mudar("cidade", e.target.value)}
              error={!!salvamento.erros.cidade}
              helperText={salvamento.erros.cidade}
              slotProps={{ htmlInput: { maxLength: TETOS_DO_EVENTO.cidade } }}
              sx={{ flex: 2 }}
            />
            <TextField
              label="Estado"
              value={campos.uf}
              onChange={e => mudar("uf", e.target.value.toUpperCase())}
              error={!!salvamento.erros.uf}
              helperText={salvamento.erros.uf}
              slotProps={{ htmlInput: { maxLength: TETOS_DO_EVENTO.uf } }}
              sx={{ flex: 1 }}
            />
          </Stack>
        </Stack>
      </Card>

      <Button
        variant="contained"
        onClick={salvar}
        // O botão desabilita durante o envio e não troca de largura: dois toques
        // não podem gravar duas vezes.
        disabled={salvamento.salvando}
        sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
      >
        {salvamento.salvando ? "Salvando…" : "Salvar a capa"}
      </Button>
    </Stack>
  );
}

export default EditorDaCapa;
