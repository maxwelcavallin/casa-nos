"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState } from "react";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { FaixaVisaoDono } from "@/components/painel/FaixaVisaoDono";
import { NumeroHonesto } from "@/components/painel/NumeroHonesto";
import { largura } from "@/lib/tokens";

/**
 * O PAINEL DO DIA (H-19) — **sete números, um por linha, e nenhum a mais.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SETE, E NÃO QUATORZE. Cada número a mais reduz a chance de alguém olhar os
 * sete que importam. Ficaram de fora, de propósito: aberturas de página,
 * sessões, usuários em tempo real e mídias por convidado — nenhum deles muda uma
 * decisão naquela noite.
 *
 * **NENHUM GRÁFICO.** Não há série temporal, não há barra, não há rosca. É uma
 * tela que alguém olha por dez segundos no meio de uma festa para saber se algo
 * está quebrado, e um gráfico obrigaria a interpretar antes de responder.
 *
 * **AS SETE LINHAS EXISTEM ANTES DE EXISTIR NÚMERO.** A tela não encolhe e não
 * cresce quando a festa começa: os rótulos são a estrutura, e os números entram
 * nos lugares que já estavam lá. Zero seria mentira; "Ainda não começou" é
 * verdade.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DUAS AUSÊNCIAS DIFERENTES, E ELAS NÃO PODEM PARECER A MESMA COISA:
 * a linha 1 sem denominador é uma **pendência do casal**, e o texto diz onde
 * resolver; a linha que não conseguiu ler é uma **falha nossa**, com travessão e
 * motivo em `error`. Nenhuma das duas mostra zero.
 */

const INTERVALO_MS = 60_000;

type Linha<T> = { ok: true; valor: T } | { ok: false };

type Resposta = {
  comecou: boolean;
  participacao: Linha<{
    slotsPublicaram: number;
    slotsPresentes: number;
    presentesContagem: number | null;
    participacaoSlots: number | null;
    pisoPessoas: number | null;
    tetoPessoas: number | null;
  }>;
  midias: Linha<{ armazenadas: number; emAltaResolucao: number }>;
  fila: Linha<{ pendentes: number; idadeDoMaisVelhoMinutos: number | null }>;
  erros: Linha<{ rede: number; portal: number; servidor: number; arquivo: number }>;
  distribuicao: Linha<{
    fracaoFesta: number | null;
    fracaoNoivos: number | null;
    fracaoMexeram: number | null;
  }>;
  moderacoes: Linha<number>;
  loop: Linha<{ alcancaram: number; leads: number; leadsComData: number }>;
  telao: Linha<{ links: number; ultimoUsoMinutos: number | null }>;
};

const ERRO_DA_LINHA = "Não conseguimos ler agora";
const AINDA_NAO = "Ainda não começou";

/** `0.6423` → `"64%"`. Sem casa decimal: ninguém age sobre a diferença de 0,4 %. */
function porcento(fracao: number | null): string | null {
  return fracao === null ? null : `${Math.round(fracao * 100)}%`;
}

export type PropriedadesDoDiaAoVivo = { eventoId: string; usuario: string | null };

export function DiaAoVivo({ eventoId, usuario }: PropriedadesDoDiaAoVivo) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroGeral, setErroGeral] = useState(false);

  const buscar = useCallback(async () => {
    try {
      const resposta = await fetch(`/api/eventos/${eventoId}/medicao`, {
        cache: "no-store",
      });
      if (!resposta.ok) throw new Error(String(resposta.status));
      setDados((await resposta.json()) as Resposta);
      setErroGeral(false);
    } catch {
      /**
       * Falha da requisição inteira: **os números anteriores ficam na tela**, e
       * a única mudança é o cabeçalho dizer que a atualização parou. Zerar a
       * tela porque uma sondagem falhou trocaria sete números de um minuto atrás
       * por sete travessões — e um minuto atrás é uma informação melhor que nada
       * quando alguém está decidindo se age.
       */
      setErroGeral(true);
    } finally {
      // Todo caminho de saída desliga o carregando (regra §12 do `stack.md`).
      setCarregando(false);
    }
  }, [eventoId]);

  useEffect(() => {
    // Ver `lib/usar-feed.ts`: exceção estreita, com o motivo. A regra recusa
    // qualquer função assíncrona que chame `setState` e seja chamada de dentro
    // de um efeito, mesmo quando o primeiro `setState` só acontece depois de um
    // `await` — que é o caso de todo carregamento de dado na montagem. O que
    // continua guardado é o `carregando` desligando só no `finally`, e a catraca
    // do design system mede exatamente isso, em zero.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar();
    const temporizador = setInterval(() => void buscar(), INTERVALO_MS);
    return () => clearInterval(temporizador);
  }, [buscar]);

  const vazio = dados !== null && !dados.comecou;

  /** O `ausente` de toda linha antes de a festa começar. */
  const aindaNao = vazio ? AINDA_NAO : null;

  const participacao = dados?.participacao;
  const midias = dados?.midias;
  const fila = dados?.fila;
  const erros = dados?.erros;
  const distribuicao = dados?.distribuicao;
  const moderacoes = dados?.moderacoes;
  const loop = dados?.loop;
  const telao = dados?.telao;

  /**
   * Linha 1 — a única que tem TRÊS ausências possíveis, e as três são
   * diferentes: a festa não começou, a leitura falhou, ou **o casal não digitou
   * a contagem do buffet**. A terceira não é erro nosso e não é o calendário: é
   * uma pendência, e o texto diz onde resolver. Nunca um número calculado sobre
   * denominador inventado — o número inventado seria bonito e seria usado.
   */
  const semDenominador =
    participacao?.ok === true && participacao.valor.presentesContagem === null;

  return (
    <>
      <GoogleAnalytics eventoId={eventoId} superficie="casal" usuario={usuario} />
      {/**
       * A faixa aqui **não é opcional nem decorativa**: esta é a única tela do
       * produto que mostra medição, e o padrão da casa exige que o privilégio
       * seja visível na interface. Ela é fixa, não é fechável, e não rola para
       * fora — um privilégio que some ao rolar é um privilégio escondido.
       */}
      <FaixaVisaoDono />

      <Box
        component="main"
        sx={{
          maxWidth: largura.conteudo,
          mx: "auto",
          px: { xs: 2, sm: 3 },
          pb: 8,
          minHeight: "100dvh",
        }}
      >
        <Stack component="header" sx={{ py: 3, gap: 0.5 }}>
          <Typography variant="h3" component="h1">
            O dia ao vivo
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {erroGeral
              ? "A atualização parou. Os números abaixo são os últimos que chegaram."
              : "Atualiza a cada minuto."}
          </Typography>
          {/**
           * O SINAL DO TELÃO — **não é o oitavo número**, e por isso mora aqui,
           * ao lado do estado do próprio instrumento.
           *
           * Ele é o consumidor de `evento_acessos.ultimo_uso_em`, o carimbo que
           * a F1.4 passou a escrever sem ter tela que o lesse. O motivo está no
           * topo de `TelaoDoSalao`: **telão parado e telão rodando são
           * visualmente idênticos da pista de dança**. A parede é muda por
           * especificação — erro projetado num casamento é incidente, não
           * estado —, e esta linha é a única forma de alguém descobrir que ela
           * congelou.
           */}
          {telao?.ok && telao.valor.links > 0 ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {telao.valor.ultimoUsoMinutos === null
                ? "O telão ainda não falou com a gente."
                : telao.valor.ultimoUsoMinutos < 2
                  ? "O telão falou com a gente agora."
                  : `O telão falou com a gente há ${telao.valor.ultimoUsoMinutos} min.`}
            </Typography>
          ) : null}
        </Stack>

        <Divider />

        {/* 1 */}
        <NumeroHonesto
          rotulo="Convidados que participaram"
          carregando={carregando}
          erro={participacao?.ok === false ? ERRO_DA_LINHA : null}
          ausente={
            aindaNao ??
            (semDenominador ? "Denominador ainda não informado" : null)
          }
          valor={
            participacao?.ok
              ? `${participacao.valor.slotsPublicaram} de ${participacao.valor.slotsPresentes}`
              : null
          }
          apoio={
            participacao?.ok && !semDenominador
              ? `piso ${porcento(participacao.valor.pisoPessoas) ?? "—"} · teto ${
                  porcento(participacao.valor.tetoPessoas) ?? "—"
                }`
              : semDenominador
                ? 'Digite a contagem do buffet em "Sua lista de convidados" para este número existir.'
                : undefined
          }
        />
        <Divider />

        {/* 2 */}
        <NumeroHonesto
          rotulo="Fotos guardadas"
          carregando={carregando}
          erro={midias?.ok === false ? ERRO_DA_LINHA : null}
          ausente={aindaNao}
          valor={midias?.ok ? midias.valor.armazenadas.toLocaleString("pt-BR") : null}
          // A segunda grandeza, **nunca somada com a primeira** (RN-15).
          apoio={
            midias?.ok
              ? `${midias.valor.emAltaResolucao.toLocaleString("pt-BR")} em alta resolução`
              : undefined
          }
        />
        <Divider />

        {/* 3 */}
        <NumeroHonesto
          rotulo="Esperando aprovação"
          carregando={carregando}
          erro={fila?.ok === false ? ERRO_DA_LINHA : null}
          ausente={aindaNao}
          valor={fila?.ok ? String(fila.valor.pendentes) : null}
          apoio={
            fila?.ok && fila.valor.idadeDoMaisVelhoMinutos !== null
              ? `a mais antiga há ${fila.valor.idadeDoMaisVelhoMinutos} min`
              : undefined
          }
        />
        <Divider />

        {/* 4 */}
        <NumeroHonesto
          rotulo="Erros"
          carregando={carregando}
          erro={erros?.ok === false ? ERRO_DA_LINHA : null}
          ausente={aindaNao}
          valor={
            erros?.ok
              ? `${erros.valor.rede} de rede · ${erros.valor.servidor} de servidor`
              : null
          }
          /**
           * **`portal` APARECE SOZINHO, E SÓ QUANDO EXISTE.**
           *
           * `rede` e `portal` pedem ações OPOSTAS: `rede` é a internet que caiu,
           * e a resposta certa é não fazer nada — a fila existe para isso.
           * `portal` é a internet que **mentiu**, o único erro desta lista que
           * produz perda silenciosa, e o único em que agir é obrigatório: trocar
           * de rede, ou passar para o QR do plano B.
           *
           * Por isso ele não entra na mesma linha dos outros dois, e por isso a
           * linha de apoio **traz a ação junto com o número** — quem lê isto às
           * 23h precisa saber o que fazer, não o que aconteceu.
           *
           * E é por isso que este número sai do Postgres: num portal cativo, o
           * `/g/collect` do GA4 também é interceptado. Lá o valor é
           * subnotificado por construção.
           */
          apoio={
            erros?.ok && erros.valor.portal > 0 ? (
              <Box component="span" sx={{ color: "error.main" }}>
                {erros.valor.portal} de portal cativo — trocar a rede ou usar o QR do plano B
              </Box>
            ) : undefined
          }
        />
        <Divider />

        {/* 5 */}
        <NumeroHonesto
          rotulo="Como estão mandando"
          carregando={carregando}
          erro={distribuicao?.ok === false ? ERRO_DA_LINHA : null}
          ausente={aindaNao}
          valor={
            distribuicao?.ok
              ? `${porcento(distribuicao.valor.fracaoFesta) ?? "—"} para a festa`
              : null
          }
          apoio={
            distribuicao?.ok
              ? `${porcento(distribuicao.valor.fracaoNoivos) ?? "—"} só para os noivos · ${
                  porcento(distribuicao.valor.fracaoMexeram) ?? "—"
                } mexeram na escolha`
              : undefined
          }
        />
        <Divider />

        {/* 6 */}
        <NumeroHonesto
          rotulo="Aprovações durante a festa"
          carregando={carregando}
          erro={moderacoes?.ok === false ? ERRO_DA_LINHA : null}
          ausente={aindaNao}
          valor={moderacoes?.ok ? String(moderacoes.valor) : null}
        />
        <Divider />

        {/* 7 */}
        <NumeroHonesto
          rotulo="Alcance do loop"
          carregando={carregando}
          erro={loop?.ok === false ? ERRO_DA_LINHA : null}
          ausente={aindaNao}
          valor={loop?.ok ? `${loop.valor.alcancaram} viram` : null}
          /**
           * **"Clicaram" não está aqui, e a ausência é declarada.**
           *
           * `metricas.md` §11 pede "viram · clicaram · leads com data". O clique
           * abre uma folha local, sem ida ao servidor — de propósito, porque uma
           * requisição a mais no salão é uma chance a mais de falhar. Ele existe
           * no GA4 (`growth_cta_clicked`) e não no Postgres, e este painel é SQL
           * por decisão (§11: o Tempo Real do GA4 ignora justamente os envios
           * offline que este produto existe para salvar).
           *
           * Escrever um número aqui exigiria uma requisição por toque só para
           * alimentar um painel. Está registrado como divergência com o
           * `gtm.md` §5.15 em `docs/fatia-1-f1-5-f1-7.md`.
           */
          apoio={
            loop?.ok
              ? `${loop.valor.leads} deixaram contato · ${loop.valor.leadsComData} com data`
              : undefined
          }
        />
      </Box>
    </>
  );
}

export default DiaAoVivo;
