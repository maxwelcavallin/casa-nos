"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { FaixaVisaoDono } from "@/components/painel/FaixaVisaoDono";
import { largura, toque } from "@/lib/tokens";

/**
 * O DIA DO CASAMENTO (H-02) — a primeira tela do produto com busca no cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRÊS JANELAS, E ELAS NÃO SÃO A MESMA COISA (PRD §3.1, V9). Esta tela escreve
 * duas — envio e festa — e a terceira (medição) é derivada e não se configura.
 * Confundi-las produz um número errado sem nenhum erro aparecer, e é por isso
 * que os dois campos têm textos de apoio dizendo para que cada um serve.
 *
 * O QUE FOI DIGITADO NUNCA SE PERDE. Nem quando a validação reprova, nem quando
 * o salvamento falha por rede. O estado do formulário é local e não é remontado
 * a partir da resposta — a noiva que preencheu seis campos no 4G do carro não
 * pode perdê-los porque o servidor demorou.
 *
 * ERRO NO CAMPO, NUNCA SÓ NO TOPO (`design-system.md` §11 da casa). A API
 * devolve `{ erro, detalhe: { campo: mensagem } }`, e cada mensagem vai para o
 * `helperText` do seu campo. Um alerta no topo resumindo o que aconteceu embaixo
 * é reprovação da §17.3 do design system.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Moderador = { id: string; rotulo: string | null };

export type DadosDoDia = {
  eventoId: string;
  nomeCasal: string;
  dataPorExtenso: string;
  envioAbreEm: string;
  envioFechaEm: string;
  inicioFestaEm: string;
  fimFestaEm: string;
  modoModeracao: "direto" | "fila";
  presentesContagem: string;
  moderadores: Moderador[];
  temTelao: boolean;
  /** Evento recém-criado: a tela mostra a lista de preparo, não "nada configurado". */
  pareceNovo: boolean;
  ehDono: boolean;
  /** A festa já acabou? A contagem de presentes só aparece depois dela. */
  festaTerminou: boolean;
};

type Erros = Record<string, string>;

export function TelaDoDia({ dados }: { dados: DadosDoDia }) {
  const [campos, setCampos] = useState({
    envio_abre_em: dados.envioAbreEm,
    envio_fecha_em: dados.envioFechaEm,
    inicio_festa_em: dados.inicioFestaEm,
    fim_festa_em: dados.fimFestaEm,
    modo_moderacao: dados.modoModeracao,
    presentes_contagem: dados.presentesContagem,
  });
  const [erros, setErros] = useState<Erros>({});
  const [salvando, setSalvando] = useState(false);
  const [avisoGeral, setAvisoGeral] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const semModerador = dados.moderadores.length === 0;
  /**
   * "Sem moderador designado o botão de salvar fica desabilitado, com o motivo
   * escrito ao lado — não em `tooltip`." Tooltip não existe no celular, e este
   * painel abre no celular da noiva na véspera.
   */
  const bloqueadoPorModerador = campos.modo_moderacao === "fila" && semModerador;

  function mudar(campo: keyof typeof campos, valor: string) {
    setCampos(atual => ({ ...atual, [campo]: valor }));
    // O erro do campo some quando ele é editado — mas a VALIDAÇÃO só acontece no
    // envio (§11 da casa): validar enquanto a pessoa ainda digita a data é
    // hostil, porque toda data incompleta é inválida no meio da digitação.
    setErros(atual => {
      if (!atual[campo]) return atual;
      const copia = { ...atual };
      delete copia[campo];
      return copia;
    });
    setSalvo(false);
  }

  async function salvar() {
    setSalvando(true);
    setAvisoGeral(null);
    try {
      const resposta = await fetch(`/api/eventos/${dados.eventoId}/dia`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(campos),
      });

      if (resposta.ok) {
        setErros({});
        setSalvo(true);
        return;
      }

      const corpo = (await resposta.json().catch(() => ({}))) as {
        detalhe?: unknown;
      };
      if (corpo.detalhe && typeof corpo.detalhe === "object") {
        setErros(corpo.detalhe as Erros);
      } else {
        setAvisoGeral("Não conseguimos salvar agora. O que você digitou continua aqui.");
      }
    } catch {
      // Falha de rede. O texto diz o que importa: nada do que ela escreveu se
      // perdeu — e não se perdeu mesmo, porque o estado é local.
      setAvisoGeral("Não conseguimos salvar agora. O que você digitou continua aqui.");
    } finally {
      // Todo caminho de saída desliga o "salvando", inclusive o `return` do
      // caminho feliz lá em cima (`stack.md` §6).
      setSalvando(false);
    }
  }

  return (
    <Box component="main" sx={{ maxWidth: largura.conteudo, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
      {/* Selo permanente e não fechável quando a sessão é do dono: o padrão da
          casa exige que o privilégio seja visível na interface, não escondido no
          código. */}
      {dados.ehDono ? <FaixaVisaoDono /> : null}

      <Stack sx={{ gap: 3 }}>
        <Stack sx={{ gap: 0.5 }}>
          <Typography variant="h3" component="h1">
            O dia do casamento
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Como as fotos vão funcionar no dia {dados.dataPorExtenso}.
          </Typography>
          {/* O nome do casal mora AQUI e não no `h1`: título que carrega dado de
              usuário precisa de tratamento de truncamento e quebra com 60
              caracteres — e não informa nada a quem já sabe de quem é o
              casamento (design system §17.6). */}
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            {dados.nomeCasal}
          </Typography>
        </Stack>

        {dados.pareceNovo ? (
          // O VAZIO NÃO NOMEIA O QUE NÃO EXISTE. Não é "nada configurado": é a
          // lista do que fazer antes da festa.
          <Card sx={{ p: 2 }}>
            <Typography variant="h5" component="h2" sx={{ mb: 1 }}>
              Três coisas antes da festa
            </Typography>
            <Stack component="ol" sx={{ gap: 0.5, pl: 3, m: 0 }}>
              <Typography component="li" variant="body2">
                Imprimir o código para as mesas
              </Typography>
              <Typography component="li" variant="body2">
                Escolher como as fotos aparecem
              </Typography>
              <Typography component="li" variant="body2">
                Mandar uma foto de teste do seu celular
              </Typography>
            </Stack>
          </Card>
        ) : null}

        <Card sx={{ p: 2 }}>
          <Stack sx={{ gap: 2 }}>
            <Stack sx={{ gap: 1 }}>
              <Typography variant="subtitle2" component="h2">
                Quando os convidados podem mandar fotos
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1.5 }}>
                <TextField
                  label="Começa"
                  type="datetime-local"
                  value={campos.envio_abre_em}
                  onChange={e => mudar("envio_abre_em", e.target.value)}
                  error={!!erros.envio_abre_em}
                  helperText={erros.envio_abre_em}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Termina"
                  type="datetime-local"
                  value={campos.envio_fecha_em}
                  onChange={e => mudar("envio_fecha_em", e.target.value)}
                  error={!!erros.envio_fecha_em}
                  helperText={erros.envio_fecha_em}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Começa na véspera e termina 7 dias depois da festa. Dá para mudar.
              </Typography>
            </Stack>

            <Stack sx={{ gap: 1 }}>
              <Typography variant="subtitle2" component="h2">
                Horário da festa
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1.5 }}>
                <TextField
                  label="Começa"
                  type="datetime-local"
                  value={campos.inicio_festa_em}
                  onChange={e => mudar("inicio_festa_em", e.target.value)}
                  error={!!erros.inicio_festa_em}
                  helperText={erros.inicio_festa_em}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Termina"
                  type="datetime-local"
                  value={campos.fim_festa_em}
                  onChange={e => mudar("fim_festa_em", e.target.value)}
                  error={!!erros.fim_festa_em}
                  helperText={erros.fim_festa_em}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Serve para a gente não te mandar nenhum aviso enquanto ela acontece.
              </Typography>
            </Stack>
          </Stack>
        </Card>

        <Card sx={{ p: 2 }}>
          <Stack sx={{ gap: 1 }}>
            <Typography variant="subtitle2" component="h2" id="rotulo-moderacao">
              As fotos aparecem no álbum e no telão
            </Typography>
            <RadioGroup
              aria-labelledby="rotulo-moderacao"
              value={campos.modo_moderacao}
              onChange={e => mudar("modo_moderacao", e.target.value)}
            >
              {/* `direto` vem pré-selecionado e escrito com a consequência: a
                  escolha padrão é a que não exige mais ninguém trabalhando. */}
              <FormControlLabel
                value="direto"
                control={<Radio />}
                sx={{ alignItems: "flex-start", py: 1 }}
                label={
                  <Stack sx={{ py: 0.5 }}>
                    <Typography variant="subtitle2">Na hora</Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      As fotos aparecem assim que chegam. Você pode tirar qualquer uma
                      depois.
                    </Typography>
                  </Stack>
                }
              />
              <FormControlLabel
                value="fila"
                control={<Radio />}
                sx={{ alignItems: "flex-start", py: 1 }}
                label={
                  <Stack sx={{ py: 0.5 }}>
                    <Typography variant="subtitle2">Depois de alguém aprovar</Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      As fotos chegam para você na hora do mesmo jeito. A aprovação
                      decide só o que aparece no álbum e no telão.
                    </Typography>
                  </Stack>
                }
              />
            </RadioGroup>

            <Typography variant="subtitle2" component="h3">
              Quem aprova
            </Typography>
            {dados.moderadores.length > 0 ? (
              <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                {dados.moderadores.map(moderador => (
                  <Typography
                    key={moderador.id}
                    variant="body2"
                    sx={{
                      px: 1.5,
                      py: 0.5,
                      borderRadius: 999,
                      bgcolor: "action.selected",
                    }}
                  >
                    {moderador.rotulo ?? "Sem nome"}
                  </Typography>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Escolha um padrinho, a assessora, alguém que não vai estar dançando. Sem
                alguém aqui, nada aparece no telão durante a festa.
              </Typography>
            )}
            {erros.modo_moderacao ? (
              <Typography variant="body2" sx={{ color: "error.main" }}>
                {erros.modo_moderacao}
              </Typography>
            ) : null}
          </Stack>
        </Card>

        {/* A contagem de presentes só aparece DEPOIS da festa: antes dela o
            número não existe, e um campo vazio pedindo "quantas pessoas foram"
            na véspera é uma pergunta que ninguém pode responder. */}
        {dados.festaTerminou ? (
          <Card sx={{ p: 2 }}>
            <Stack sx={{ gap: 1 }}>
              <TextField
                label="Quantas pessoas foram"
                inputMode="numeric"
                value={campos.presentes_contagem}
                onChange={e => mudar("presentes_contagem", e.target.value)}
                error={!!erros.presentes_contagem}
                helperText={erros.presentes_contagem}
                sx={{ maxWidth: 200 }}
              />
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                O número fechado do buffet. É o que permite calcular quantos convidados
                participaram.
              </Typography>
            </Stack>
          </Card>
        ) : null}

        {avisoGeral ? (
          <Alert severity="warning" action={<Button onClick={salvar}>Tentar de novo</Button>}>
            {avisoGeral}
          </Alert>
        ) : null}

        <Stack direction="row" sx={{ gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          <Button
            variant="contained"
            onClick={salvar}
            disabled={salvando || bloqueadoPorModerador}
            sx={{ minHeight: toque.confortavel }}
          >
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
          {bloqueadoPorModerador ? (
            // Ao LADO do botão, nunca em tooltip: no celular tooltip não existe.
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Escolha quem aprova para poder salvar.
            </Typography>
          ) : null}
          {salvo ? (
            <Typography role="status" variant="body2" sx={{ color: "success.main" }}>
              Salvo.
            </Typography>
          ) : null}
        </Stack>
      </Stack>
    </Box>
  );
}
