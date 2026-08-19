"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { LIMITES_DO_MAPA, TETOS_DO_EVENTO } from "@/lib/site-evento";
import { toque } from "@/lib/tokens";
import { useSalvamento } from "@/lib/usar-salvamento";

/**
 * ONDE E QUANDO — quanto do local o site conta (v1.0, V-05).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRÊS NÍVEIS, E ELES JÁ EXISTIAM COMO DADO. O que faltava era o casal poder
 * mudá-los:
 *
 *   oculto  a cidade e "em breve", sem mapa
 *   regiao  o mapa com a ÁREA e nenhum marcador, sem endereço, sem link de rotas
 *   exato   pin, endereço e link de rotas
 *
 * **O NOME DO LOCAL E O MAPA SÃO DUAS DECISÕES INDEPENDENTES**, e por isso são
 * duas flags. O casal quer o mapa visível e o nome escondido: o convidado entende
 * para que lado da cidade vai, e o estabelecimento não é identificável. Juntar as
 * duas num único "revelar o local" tiraria exatamente o arranjo que este
 * casamento usa hoje.
 *
 * **O PONTO EM `regiao` É O CENTRO DA ÁREA, NÃO O ENDEREÇO.** O texto de apoio do
 * campo diz isso, porque o casal que colar a coordenada exata do salão e escolher
 * "só a região" terá dado o endereço a quem souber ler um mapa — e vai achar que
 * escondeu.
 *
 * **ESCOLHER O PONTO CLICANDO NO MAPA E BUSCAR ENDEREÇO POR AUTOCOMPLETAR ESTÃO
 * FORA** (prd-v1 §2.2): as duas exigem chave de API de mapa, e o ADR 0002 decidiu
 * não ter uma.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DadosDeOnde = {
  eventoId: string;
  localNome: string;
  localNomePublicado: boolean;
  localRevelacao: "oculto" | "regiao" | "exato";
  localLatitude: string;
  localLongitude: string;
  localRaioMetros: string;
  localEndereco: string;
};

export function EditorDeOnde({ dados }: { dados: DadosDeOnde }) {
  const [campos, setCampos] = useState({
    local_nome: dados.localNome,
    local_nome_publicado: dados.localNomePublicado,
    local_revelacao: dados.localRevelacao,
    local_latitude: dados.localLatitude,
    local_longitude: dados.localLongitude,
    local_raio_metros: dados.localRaioMetros,
    local_endereco: dados.localEndereco,
  });
  const salvamento = useSalvamento();

  function mudar<C extends keyof typeof campos>(campo: C, valor: (typeof campos)[C]) {
    setCampos(atual => ({ ...atual, [campo]: valor }));
    salvamento.limpar();
  }

  async function salvar() {
    await salvamento.enviar(`/api/eventos/${dados.eventoId}/site/evento`, "PATCH", {
      ...campos,
      // Campo numérico vazio viaja como `null`, e não como `""`: `null` é o que
      // significa "ainda não tem coordenada", e é o estado ao qual o casal
      // precisa poder voltar.
      local_latitude: campos.local_latitude === "" ? null : campos.local_latitude,
      local_longitude: campos.local_longitude === "" ? null : campos.local_longitude,
      local_raio_metros: campos.local_raio_metros === "" ? null : campos.local_raio_metros,
    });
  }

  const mostraMapa = campos.local_revelacao !== "oculto";

  return (
    <Stack sx={{ gap: 2 }}>
      {salvamento.erroGeral ? <Alert severity="error">{salvamento.erroGeral}</Alert> : null}
      {salvamento.salvou ? (
        <Alert severity="success">Salvo. O site já mostra isto na próxima carga.</Alert>
      ) : null}

      <Card sx={{ p: 2 }}>
        <Stack sx={{ gap: 2.5 }}>
          <TextField
            label="Nome do local"
            value={campos.local_nome}
            onChange={e => mudar("local_nome", e.target.value)}
            error={!!salvamento.erros.local_nome}
            helperText={
              salvamento.erros.local_nome ??
              "Fica guardado mesmo sem ser anunciado — dá para preencher agora e divulgar depois."
            }
            slotProps={{ htmlInput: { maxLength: TETOS_DO_EVENTO.localNome } }}
            fullWidth
          />

          <FormControlLabel
            control={
              <Switch
                checked={campos.local_nome_publicado}
                onChange={e => mudar("local_nome_publicado", e.target.checked)}
              />
            }
            label="Anunciar o nome do local no site"
          />

          <FormControl>
            {/* `FormLabel` de verdade sobre o grupo: sem ele, o leitor de tela lê
                três opções soltas sem saber do que são. */}
            <FormLabel id="rotulo-revelacao">Quanto do lugar o site conta</FormLabel>
            <RadioGroup
              aria-labelledby="rotulo-revelacao"
              value={campos.local_revelacao}
              onChange={e =>
                mudar("local_revelacao", e.target.value as DadosDeOnde["localRevelacao"])
              }
            >
              <FormControlLabel
                value="oculto"
                control={<Radio />}
                label="Nada ainda — só a cidade"
              />
              <FormControlLabel
                value="regiao"
                control={<Radio />}
                label="A região, sem marcador e sem endereço"
              />
              <FormControlLabel
                value="exato"
                control={<Radio />}
                label="O endereço exato, com pin e link de rotas"
              />
            </RadioGroup>
            {salvamento.erros.local_revelacao ? (
              <Typography variant="caption" sx={{ color: "error.main" }}>
                {salvamento.erros.local_revelacao}
              </Typography>
            ) : null}
          </FormControl>

          {mostraMapa ? (
            <Stack sx={{ gap: 2 }}>
              <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
                <TextField
                  label="Latitude"
                  value={campos.local_latitude}
                  onChange={e => mudar("local_latitude", e.target.value)}
                  error={!!salvamento.erros.local_latitude}
                  helperText={salvamento.erros.local_latitude}
                  // `inputMode="decimal"` e não `type="number"`: o segundo esconde
                  // o sinal de menos em alguns teclados de celular, e toda
                  // latitude brasileira é negativa.
                  slotProps={{ htmlInput: { inputMode: "decimal" } }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Longitude"
                  value={campos.local_longitude}
                  onChange={e => mudar("local_longitude", e.target.value)}
                  error={!!salvamento.erros.local_longitude}
                  helperText={salvamento.erros.local_longitude}
                  slotProps={{ htmlInput: { inputMode: "decimal" } }}
                  sx={{ flex: 1 }}
                />
              </Stack>

              {campos.local_revelacao === "regiao" ? (
                <Stack sx={{ gap: 0.5 }}>
                  <TextField
                    label="Raio da área, em metros"
                    value={campos.local_raio_metros}
                    onChange={e => mudar("local_raio_metros", e.target.value)}
                    error={!!salvamento.erros.local_raio_metros}
                    helperText={
                      salvamento.erros.local_raio_metros ??
                      `Entre ${LIMITES_DO_MAPA.raioMetros[0]} e ${LIMITES_DO_MAPA.raioMetros[1]}. Vazio usa 4.000.`
                    }
                    slotProps={{ htmlInput: { inputMode: "numeric" } }}
                    fullWidth
                  />
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    O ponto aqui é o <strong>centro da área</strong>, não o endereço.
                    Se vocês puserem a coordenada exata do salão, quem souber ler um
                    mapa descobre o lugar.
                  </Typography>
                </Stack>
              ) : null}
            </Stack>
          ) : null}

          <TextField
            label="Endereço"
            value={campos.local_endereco}
            onChange={e => mudar("local_endereco", e.target.value)}
            error={!!salvamento.erros.local_endereco}
            helperText={
              salvamento.erros.local_endereco ??
              "Só sai no site com o endereço exato escolhido acima."
            }
            slotProps={{ htmlInput: { maxLength: TETOS_DO_EVENTO.localEndereco } }}
            multiline
            minRows={2}
            fullWidth
          />
        </Stack>
      </Card>

      <Button
        variant="contained"
        onClick={salvar}
        disabled={salvamento.salvando}
        sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
      >
        {salvamento.salvando ? "Salvando…" : "Salvar onde e quando"}
      </Button>
    </Stack>
  );
}

export default EditorDeOnde;
