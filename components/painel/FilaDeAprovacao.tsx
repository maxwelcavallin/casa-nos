"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useId, useState } from "react";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { CardMidia } from "@/components/album/CardMidia";
import { EsqueletoDaGrade, GradeMidias } from "@/components/album/GradeMidias";
import { EstadoVazio } from "@/components/EstadoVazio";
import { FaixaVisaoDono } from "@/components/painel/FaixaVisaoDono";
import { enviarEvento } from "@/lib/analytics";
import { largura, toque } from "@/lib/tokens";

/**
 * A FILA DE APROVAÇÃO (H-13) — e ela segura o feed, nunca o casal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **ESTA É A ÚNICA TELA DO PAINEL QUE ALGUÉM ABRE NO CELULAR ÀS 23H** — um
 * padrinho, a assessora, alguém que o casal designou justamente para o casal não
 * precisar. Por isso o botão de aprovar é grande, fixo no rodapé e alcançável
 * com o polegar, e por isso a tela foi desenhada primeiro em 360 e depois em
 * 1440 (é o inverso do resto do painel).
 *
 * O SUBTÍTULO É A PROMESSA INTEIRA: *"Só decide o que aparece no álbum e no
 * telão. Tudo já está com você."* Nada aqui apaga nada, nada aqui é urgente, e
 * quem não abrir esta tela nunca perde uma foto.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **SEM SELO DE APROVAÇÃO NOS TILES.** Nesta tela todos estão esperando: o eixo
 * não varia, e carimbar um eixo que não varia é ruído em 400 cards. Ele varia no
 * painel de mídias, onde a fila convive com o que já foi aprovado, e é lá que o
 * selo existe.
 */

export type PropriedadesDaFila = {
  eventoId: string;
  ehDono: boolean;
  modoInicial: "direto" | "fila";
  usuario: string | null;
};

type ItemDaFila = {
  id: string;
  rotulo: string | null;
  miniatura: string | null;
};

type Estado = {
  carregando: boolean;
  erro: string | null;
  itens: ItemDaFila[];
  cursor: string | null;
  total: number;
  maisAntigaHora: string | null;
};

const INICIAL: Estado = {
  carregando: true,
  erro: null,
  itens: [],
  cursor: null,
  total: 0,
  maisAntigaHora: null,
};

export function FilaDeAprovacao({
  eventoId,
  ehDono,
  modoInicial,
  usuario,
}: PropriedadesDaFila) {
  const idDaGrade = useId();
  const [estado, setEstado] = useState<Estado>(INICIAL);
  const [modo, setModo] = useState(modoInicial);
  const [agindo, setAgindo] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);
  const [parcial, setParcial] = useState<{ foram: number; ficaram: number } | null>(null);
  const [ofereceAprovarTudo, setOfereceAprovarTudo] = useState(false);

  const buscar = useCallback(async () => {
    setEstado(anterior => ({ ...anterior, carregando: true, erro: null }));
    /**
     * **O DESLIGAMENTO DO `carregando` MORA NO `finally`, E SÓ NELE** (regra §12
     * do `stack.md`, e a catraca de `scripts/ds-medidas.mjs` mede isto).
     *
     * A forma errada é sutil: desligar dentro do `try` e dentro do `catch` cobre
     * os dois caminhos que existem hoje, e deixa de cobrir o `return` de guarda
     * que alguém acrescenta daqui a um ano. A tela fica em esqueleto para
     * sempre, sem erro e sem nada no console — que é o defeito mais difícil de
     * reproduzir deste produto.
     */
    let erro: string | null = null;
    let dados: Omit<Estado, "carregando" | "erro"> | null = null;
    try {
      const resposta = await fetch(`/api/eventos/${eventoId}/midias/moderacao`);
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as {
        itens: ItemDaFila[];
        cursor: string | null;
        total: number;
        mais_antiga_hora: string | null;
        modo_moderacao: "direto" | "fila";
      };
      dados = {
        itens: corpo.itens,
        cursor: corpo.cursor,
        total: corpo.total,
        maisAntigaHora: corpo.mais_antiga_hora,
      };
      setModo(corpo.modo_moderacao);
    } catch {
      erro = "Não conseguimos carregar as fotos agora.";
    } finally {
      setEstado(anterior => ({
        ...(dados ?? anterior),
        carregando: false,
        erro,
      }));
    }
  }, [eventoId]);

  /**
   * O guarda está DENTRO do fluxo que desliga o `carregando` — não há caminho de
   * saída que deixe a tela em esqueleto (regra §12 do `stack.md`). O `catch`
   * acima é o único outro caminho, e ele também desliga.
   */
  useEffect(() => {
    // Ver `lib/usar-feed.ts`: exceção estreita, com o motivo. A regra recusa
    // qualquer função assíncrona que chame `setState` e seja chamada de dentro
    // de um efeito, mesmo quando o primeiro `setState` só acontece depois de um
    // `await` — que é o caso de todo carregamento de dado na montagem. O que
    // continua guardado é o `carregando` desligando só no `finally`, e a catraca
    // do design system mede exatamente isso, em zero.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar();
  }, [buscar]);

  const moderar = useCallback(
    async (
      corpo: Record<string, unknown>,
      acao: "aprovada" | "recusada",
      quantasEsperadas: number
    ) => {
      setAgindo(true);
      setParcial(null);
      try {
        const resposta = await fetch(`/api/eventos/${eventoId}/midias/moderacao`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(corpo),
        });
        if (!resposta.ok) throw new Error(String(resposta.status));
        const saida = (await resposta.json()) as {
          alteradas: number;
          nao_alteradas: string[];
          durante_a_festa: boolean;
        };

        /**
         * **UM EVENTO POR DECISÃO, NÃO POR FOTO.** "Aprovar as 400" é um toque;
         * 400 eventos fariam a contagem de moderações medir o tamanho do lote em
         * vez do número de vezes que alguém precisou agir — e o bloqueio 2 do
         * verde é sobre a segunda coisa.
         *
         * `moderation_during_event` vem do SERVIDOR: a janela da festa é dado do
         * evento, e o relógio de um computador emprestado não decide veredito.
         */
        if (saida.alteradas > 0) {
          enviarEvento("media_moderated", {
            wedding_id: eventoId,
            moderation_action: acao,
            moderation_during_event: saida.durante_a_festa ? "true" : "false",
          });
        }

        const ficaram = quantasEsperadas - saida.alteradas;
        if (ficaram > 0) {
          // "Não deram certo", e não "falharam". A faixa é de aviso e não de
          // erro: um resultado que é 95% sucesso não se pinta de vermelho, e as
          // que sobraram continuam na lista, prontas para a próxima tentativa.
          setParcial({ foram: saida.alteradas, ficaram });
        } else if (acao === "aprovada") {
          setRecado(
            `Aprovamos ${saida.alteradas} ${saida.alteradas === 1 ? "foto" : "fotos"}. ` +
              "Elas já estão no álbum e no telão."
          );
        } else {
          setRecado("Tirada do álbum e do telão. Ela continua com você.");
        }
        await buscar();
      } catch {
        setParcial({ foram: 0, ficaram: quantasEsperadas });
      } finally {
        setAgindo(false);
      }
    },
    [buscar, eventoId]
  );

  async function ligarLiberacao(ligado: boolean) {
    setAgindo(true);
    try {
      const resposta = await fetch(`/api/eventos/${eventoId}/dia`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modo_moderacao: ligado ? "direto" : "fila" }),
      });
      if (!resposta.ok) throw new Error(String(resposta.status));
      setModo(ligado ? "direto" : "fila");
      /**
       * **MUDAR O MODO NÃO REPROCESSA O QUE JÁ CHEGOU** (RN-06). O carimbo de
       * aprovação nasce com a intenção, e as 400 que já esperam continuam
       * esperando. Por isso a segunda ação é **oferecida**, e não embutida: são
       * duas decisões, e juntá-las faria um interruptor de configuração aprovar
       * 400 fotos que ninguém olhou.
       */
      if (ligado && estado.total > 0) setOfereceAprovarTudo(true);
    } catch {
      setRecado("Não conseguimos mudar agora. Continua como estava.");
    } finally {
      setAgindo(false);
    }
  }

  const conteudo = (() => {
    if (estado.carregando) return <EsqueletoDaGrade quantos={12} />;

    if (estado.erro) {
      return (
        <Stack sx={{ gap: 2, py: 4 }}>
          <Typography variant="body1">{estado.erro}</Typography>
          <Button
            variant="outlined"
            onClick={() => void buscar()}
            sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
          >
            Tentar de novo
          </Button>
        </Stack>
      );
    }

    if (estado.itens.length === 0) {
      /**
       * **O ESTADO BOM**, e não um vazio triste. É onde o moderador passa a
       * maior parte da noite: sem ícone de alerta, sem cor de estado, sem "0
       * fotos". A tela precisa dizer que está tudo bem sem parecer quebrada.
       */
      return (
        <EstadoVazio
          titulo="Nada esperando por você"
          corpo="Quando chegar foto nova, ela aparece aqui. Nada disso é urgente: as fotos já são suas."
        />
      );
    }

    return (
      <GradeMidias>
        {estado.itens.map(item => (
          <CardMidia
            key={item.id}
            miniatura={item.miniatura}
            rotulo={item.rotulo}
            // Sem eixo de aprovação aqui: todas estão esperando (ver o topo).
            aoAbrir={() => void moderar({ acao: "recusada", ids: [item.id] }, "recusada", 1)}
          />
        ))}
      </GradeMidias>
    );
  })();

  return (
    <>
      <GoogleAnalytics eventoId={eventoId} superficie="casal" usuario={usuario} />
      {ehDono ? <FaixaVisaoDono /> : null}

      <Box
        component="main"
        sx={{
          maxWidth: largura.app,
          mx: "auto",
          px: { xs: 2, sm: 3 },
          pb: 14,
          minHeight: "100dvh",
        }}
      >
        <Stack component="header" sx={{ py: 3, gap: 0.5 }}>
          <Typography id={idDaGrade} variant="h3" component="h1">
            Esperando aprovação
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Só decide o que aparece no álbum e no telão. Tudo já está com você.
          </Typography>
          {estado.maisAntigaHora ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              A mais antiga chegou às {estado.maisAntigaHora}.
            </Typography>
          ) : null}
        </Stack>

        {parcial ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Stack sx={{ gap: 1, alignItems: "flex-start" }}>
              <Typography variant="body2">
                {parcial.foram} {parcial.foram === 1 ? "foto foi aprovada" : "fotos foram aprovadas"}.{" "}
                {parcial.ficaram} não {parcial.ficaram === 1 ? "deu" : "deram"} certo e{" "}
                {parcial.ficaram === 1 ? "continua" : "continuam"} na lista.
              </Typography>
              <Button
                variant="outlined"
                disabled={agindo}
                onClick={() =>
                  void moderar({ acao: "aprovada", todas: true }, "aprovada", estado.total)
                }
                sx={{ minHeight: toque.confortavel }}
              >
                Tentar as que faltam
              </Button>
            </Stack>
          </Alert>
        ) : null}

        {ofereceAprovarTudo ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Stack sx={{ gap: 1, alignItems: "flex-start" }}>
              <Typography variant="body2">
                A partir de agora, as fotos aparecem assim que chegam.
              </Typography>
              <Button
                variant="outlined"
                disabled={agindo}
                onClick={() => {
                  setOfereceAprovarTudo(false);
                  void moderar({ acao: "aprovada", todas: true }, "aprovada", estado.total);
                }}
                sx={{ minHeight: toque.confortavel }}
              >
                Aprovar também as {estado.total} que estão esperando
              </Button>
            </Stack>
          </Alert>
        ) : null}

        <FormControlLabel
          control={
            <Switch
              checked={modo === "direto"}
              disabled={agindo}
              onChange={evento => void ligarLiberacao(evento.target.checked)}
            />
          }
          label="Liberar tudo daqui pra frente"
          sx={{ mb: 2 }}
        />

        <Box
          component="section"
          role="region"
          aria-labelledby={idDaGrade}
          aria-busy={estado.carregando}
        >
          {conteudo}
        </Box>
      </Box>

      {/**
       * O BOTÃO PRINCIPAL, FIXO NO RODAPÉ E ALCANÇÁVEL COM O POLEGAR.
       *
       * Ele **não existe** com a fila vazia — um botão "Aprovar as 0" seria uma
       * mentira desabilitada —, e durante o carregamento ele é esqueleto pelo
       * mesmo motivo: o número dele ainda não existe.
       */}
      {estado.total > 0 && !estado.carregando ? (
        <Box
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            px: 2,
            pt: 1.5,
            pb: "calc(12px + env(safe-area-inset-bottom))",
            bgcolor: "background.paper",
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Box sx={{ maxWidth: largura.app, mx: "auto" }}>
            <Button
              variant="contained"
              fullWidth
              disabled={agindo}
              onClick={() =>
                void moderar({ acao: "aprovada", todas: true }, "aprovada", estado.total)
              }
              sx={{ minHeight: toque.confortavel }}
            >
              {agindo ? "Salvando…" : `Aprovar as ${estado.total}`}
            </Button>
          </Box>
        </Box>
      ) : null}

      <Snackbar
        open={recado !== null}
        autoHideDuration={6000}
        onClose={() => setRecado(null)}
        message={recado ?? ""}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ bottom: { xs: 96 } }}
      />
    </>
  );
}

export default FilaDeAprovacao;
