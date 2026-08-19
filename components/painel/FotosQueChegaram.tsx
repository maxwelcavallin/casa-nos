"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useId, useState } from "react";

import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { CardMidia } from "@/components/album/CardMidia";
import { EsqueletoDaGrade, GradeMidias } from "@/components/album/GradeMidias";
import { EstadoVazio } from "@/components/EstadoVazio";
import { FolhaOuDialogo } from "@/components/FolhaOuDialogo";
import { FaixaVisaoDono } from "@/components/painel/FaixaVisaoDono";
import { NumeroHonesto } from "@/components/painel/NumeroHonesto";
import { enviarEvento } from "@/lib/analytics";
import type { EstadoDeChegada } from "@/lib/feed";
import type { Visibilidade } from "@/lib/midias";
import { largura, toque } from "@/lib/tokens";

/**
 * O PAINEL DO CASAL — "O que chegou" (H-14).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUAS PROMESSAS VIRAM CÓDIGO NESTA TELA, e as duas são sobre número:
 *
 * 1. **`6.000 fotos, 5.412 em alta resolução` — nunca um número só, nunca a
 *    soma.** Prévia faltando é perda; original faltando é qualidade degradada
 *    (RN-14, RN-15). São duas grandezas, e elas viajam separadas do banco até
 *    aqui.
 *
 * 2. **Falha de leitura não produz número menor.** O erro aparece **no lugar do
 *    número**, com travessão e motivo — e é por número, não pela tela inteira: o
 *    segundo número continua vivo ao lado do primeiro que falhou. *"Melhor não
 *    mostrar do que mostrar errado o número de fotos do casamento de alguém."*
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **NÃO EXISTE CAMINHO PARA O CASAL TROCAR A VISIBILIDADE DE UMA FOTO.** Não é
 * um botão desabilitado com explicação: é a **ausência do controle** (PRD §3.2,
 * P2). Para tirar do álbum uma foto que está na festa, a ação é `Tirar do álbum`
 * — que escreve `aprovacao = 'recusada'`, outra coluna, outra rota. "Tornar
 * privada" sugeriria que o casal pode mover a foto de alguém para o canal
 * privado, e ele não pode.
 */

export type PropriedadesDoPainelDeMidias = {
  eventoId: string;
  ehDono: boolean;
  /** `false` para o moderador: ele vê e modera, **não** exclui nem baixa. */
  podeExcluir: boolean;
  /** `true` depois de `fim_festa_em`. Decide o aviso de rótulos repetidos (H-23). */
  festaAcabou: boolean;
  /** `true` antes de `inicio_festa_em`: o vazio é lista de preparo, não "nenhuma foto". */
  antesDaFesta: boolean;
  usuario: string | null;
  diasDesdeOEvento: number;
};

type Item = {
  id: string;
  participacao_id: string;
  rotulo: string | null;
  visibilidade: Visibilidade;
  chegada: EstadoDeChegada;
  aprovacao: "nao_requer" | "pendente" | "aprovada" | "recusada";
  miniatura: string | null;
  previa: string | null;
  tem_original: boolean;
};

type RotuloRepetido = { rotulo: string; participacoes: Array<{ id: string; midias: number }> };

type Filtro = "todas" | "noivos" | "pendentes";

const FILTROS: Array<{ valor: Filtro; rotulo: string }> = [
  { valor: "todas", rotulo: "Todas" },
  // Selo e filtro usam a palavra IDÊNTICA (`gtm.md` §3.3). "Só para você" morreu
  // por dois motivos: quebra a regra de um nome por conceito, e num painel que
  // **dois** noivos abrem, "você" não diz qual dos dois.
  { valor: "noivos", rotulo: "Só para os noivos" },
  { valor: "pendentes", rotulo: "Esperando aprovação" },
];

export function FotosQueChegaram({
  eventoId,
  ehDono,
  podeExcluir,
  festaAcabou,
  antesDaFesta,
  usuario,
  diasDesdeOEvento,
}: PropriedadesDoPainelDeMidias) {
  const idDaGrade = useId();

  const [resumo, setResumo] = useState<{
    carregando: boolean;
    erro: boolean;
    armazenadas: number;
    emAltaResolucao: number;
  }>({ carregando: true, erro: false, armazenadas: 0, emAltaResolucao: 0 });

  const [grade, setGrade] = useState<{
    carregando: boolean;
    erro: boolean;
    itens: Item[];
    cursor: string | null;
    repetidos: RotuloRepetido[];
  }>({ carregando: true, erro: false, itens: [], cursor: null, repetidos: [] });

  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [emFoco, setEmFoco] = useState<Item | null>(null);
  const [renomeando, setRenomeando] = useState<{ id: string; rotulo: string } | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  useEffect(() => {
    enviarEvento("album_opened", {
      wedding_id: eventoId,
      // O painel do casal é o mesmo álbum, visto de outra superfície: o
      // `album_kind` continua sendo `feed` (`metricas.md` §6.2), e quem separa
      // as duas leituras é a dimensão `surface`, que o `config` já manda.
      album_kind: "feed",
      days_since_event: diasDesdeOEvento,
    });
  }, [eventoId, diasDesdeOEvento]);

  /**
   * **O DESLIGAMENTO DO `carregando` MORA NO `finally`, E SÓ NELE** (regra §12
   * do `stack.md`). Desligar dentro do `try` e dentro do `catch` cobre os dois
   * caminhos que existem hoje e deixa de cobrir o `return` de guarda que alguém
   * acrescenta depois — e a tela fica em esqueleto para sempre, sem erro e sem
   * nada no console.
   */
  const buscarResumo = useCallback(async () => {
    setResumo(anterior => ({ ...anterior, carregando: true, erro: false }));
    let erro = false;
    let dados: { armazenadas: number; emAltaResolucao: number } | null = null;
    try {
      const resposta = await fetch(`/api/eventos/${eventoId}/resumo`);
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as {
        armazenadas: number;
        em_alta_resolucao: number;
      };
      dados = {
        armazenadas: corpo.armazenadas,
        emAltaResolucao: corpo.em_alta_resolucao,
      };
    } catch {
      // Erro **no lugar do número**, e nunca um zero: um `0` aqui é
      // indistinguível de uma festa que não começou, e o casal acreditaria nele.
      erro = true;
    } finally {
      setResumo(anterior => ({ ...anterior, ...(dados ?? {}), carregando: false, erro }));
    }
  }, [eventoId]);

  const buscarGrade = useCallback(async () => {
    setGrade(anterior => ({ ...anterior, carregando: true, erro: false }));
    let erro = false;
    let dados: { itens: Item[]; cursor: string | null; repetidos: RotuloRepetido[] } | null =
      null;
    try {
      const resposta = await fetch(
        `/api/eventos/${eventoId}/midias?filtro=${encodeURIComponent(filtro)}`
      );
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as {
        itens: Item[];
        cursor: string | null;
        rotulos_repetidos: RotuloRepetido[];
      };
      dados = {
        itens: corpo.itens,
        cursor: corpo.cursor,
        repetidos: corpo.rotulos_repetidos,
      };
    } catch {
      erro = true;
    } finally {
      setGrade(anterior => ({ ...anterior, ...(dados ?? {}), carregando: false, erro }));
    }
  }, [eventoId, filtro]);

  useEffect(() => {
    // Ver `lib/usar-feed.ts`: exceção estreita, com o motivo. A regra recusa
    // qualquer função assíncrona que chame `setState` e seja chamada de dentro
    // de um efeito, mesmo quando o primeiro `setState` só acontece depois de um
    // `await` — que é o caso de todo carregamento de dado na montagem. O que
    // continua guardado é o `carregando` desligando só no `finally`, e a catraca
    // do design system mede exatamente isso, em zero.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscarResumo();
  }, [buscarResumo]);

  useEffect(() => {
    // Ver `lib/usar-feed.ts`: exceção estreita, com o motivo. A regra recusa
    // qualquer função assíncrona que chame `setState` e seja chamada de dentro
    // de um efeito, mesmo quando o primeiro `setState` só acontece depois de um
    // `await` — que é o caso de todo carregamento de dado na montagem. O que
    // continua guardado é o `carregando` desligando só no `finally`, e a catraca
    // do design system mede exatamente isso, em zero.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscarGrade();
  }, [buscarGrade]);

  async function apagar(item: Item) {
    setEmFoco(null);
    try {
      const resposta = await fetch(`/api/eventos/${eventoId}/midias/${item.id}`, {
        method: "DELETE",
      });
      if (!resposta.ok) throw new Error(String(resposta.status));
      setRecado("Apagamos a foto.");
      await Promise.all([buscarGrade(), buscarResumo()]);
    } catch {
      setRecado("Não conseguimos apagar agora. A foto continua no álbum.");
    }
  }

  async function tirarDoAlbum(item: Item) {
    setEmFoco(null);
    try {
      const resposta = await fetch(`/api/eventos/${eventoId}/midias/moderacao`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "recusada", ids: [item.id] }),
      });
      if (!resposta.ok) throw new Error(String(resposta.status));
      const saida = (await resposta.json()) as {
        alteradas: number;
        durante_a_festa: boolean;
      };
      if (saida.alteradas > 0) {
        enviarEvento("media_moderated", {
          wedding_id: eventoId,
          moderation_action: "recusada",
          moderation_during_event: saida.durante_a_festa ? "true" : "false",
        });
      }
      setRecado("Tirada do álbum e do telão. Ela continua com você.");
      await buscarGrade();
    } catch {
      setRecado("Não conseguimos mudar agora. A foto continua no álbum.");
    }
  }

  async function baixar(item: Item) {
    try {
      const resposta = await fetch(`/api/eventos/${eventoId}/midias/${item.id}/download`);
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as { url: string };
      window.location.href = corpo.url;
    } catch {
      // O link continua na tela: quem falhou foi o pedido, não o botão.
      setRecado("Não conseguimos preparar o download agora.");
    }
  }

  async function renomear() {
    const alvo = renomeando;
    if (!alvo) return;
    setRenomeando(null);
    try {
      const resposta = await fetch(
        `/api/eventos/${eventoId}/participacoes/${alvo.id}/rotulo`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rotulo: alvo.rotulo }),
        }
      );
      if (!resposta.ok) throw new Error(String(resposta.status));
      setRecado("Salvo.");
      await buscarGrade();
    } catch {
      setRecado("Não conseguimos salvar agora.");
    }
  }

  const conteudoDaGrade = (() => {
    if (grade.carregando) return <EsqueletoDaGrade quantos={12} />;

    if (grade.erro) {
      return (
        <Stack sx={{ gap: 2, py: 4 }}>
          <Typography variant="body1">Não conseguimos carregar as fotos agora.</Typography>
          <Button
            variant="outlined"
            onClick={() => void buscarGrade()}
            sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
          >
            Tentar de novo
          </Button>
        </Stack>
      );
    }

    if (grade.itens.length === 0) {
      /**
       * **NUNCA "NENHUMA FOTO".** Antes da festa o vazio não é um vazio: é um
       * estado normal do calendário, e a tela mostra a lista de preparo. O vazio
       * não nomeia o que não existe — ele diz o que fazer agora.
       */
      if (antesDaFesta) {
        return (
          <EstadoVazio
            titulo="Ainda não é o dia"
            corpo={
              <Stack component="ul" sx={{ gap: 0.5, pl: 2, m: 0, textAlign: "left" }}>
                <li>Imprimir o cartão de mesa</li>
                <li>Escolher como as fotos aparecem</li>
                <li>Mandar uma foto de teste</li>
              </Stack>
            }
          />
        );
      }
      return <EstadoVazio titulo="Nada por aqui com este filtro" />;
    }

    return (
      <GradeMidias>
        {grade.itens.map(item => (
          <CardMidia
            key={item.id}
            miniatura={item.miniatura}
            visibilidade={item.visibilidade}
            chegada={item.chegada}
            rotulo={item.rotulo}
            aprovacao={item.aprovacao}
            aoAbrir={() => setEmFoco(item)}
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
          pb: 8,
          minHeight: "100dvh",
        }}
      >
        <Stack component="header" sx={{ py: 3, gap: 0.5 }}>
          <Typography id={idDaGrade} variant="h3" component="h1">
            O que chegou
          </Typography>
        </Stack>

        {/* Os dois números, lado a lado e NUNCA somados (RN-15). */}
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: { xs: 0, sm: 6 } }}>
          <NumeroHonesto
            rotulo="fotos"
            tamanho="grande"
            valor={resumo.armazenadas.toLocaleString("pt-BR")}
            carregando={resumo.carregando}
            erro={resumo.erro ? "Não conseguimos contar agora" : null}
            aoTentarDeNovo={resumo.erro ? () => void buscarResumo() : undefined}
          />
          <NumeroHonesto
            rotulo="em alta resolução"
            tamanho="grande"
            valor={resumo.emAltaResolucao.toLocaleString("pt-BR")}
            carregando={resumo.carregando}
            erro={resumo.erro ? "Não conseguimos contar agora" : null}
          />
        </Stack>

        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
          As fotos chegam em segundos numa versão menor, e a versão grande vem depois. Nenhuma
          foto se perde nesse caminho.
        </Typography>

        {/**
         * O AVISO DE RÓTULOS REPETIDOS (H-23) — **só depois da festa**.
         *
         * Durante a janela ele não aparece em forma nenhuma: o painel inteiro
         * obedece à promessa de que o casal não trabalha durante o próprio
         * casamento, e "dois aparelhos mandaram como Ana Silva" é exatamente o
         * tipo de coisa que faria alguém pegar o celular no meio da festa.
         */}
        {festaAcabou && grade.repetidos.length > 0 ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Stack sx={{ gap: 1, alignItems: "flex-start" }}>
              {grade.repetidos.slice(0, 3).map(repetido => (
                <Stack key={repetido.rotulo} sx={{ gap: 0.5, alignItems: "flex-start" }}>
                  <Typography variant="body2">
                    Dois aparelhos mandaram fotos como {repetido.rotulo}. Quer renomear um deles?
                  </Typography>
                  <Button
                    variant="text"
                    onClick={() =>
                      setRenomeando({
                        // O segundo da lista, que é o que tem menos mídias: é o
                        // que menos gente reconhece pelo nome. **Nunca numera
                        // sozinho e nunca junta** (H-23) — quem escreve o nome
                        // novo é o casal.
                        id: repetido.participacoes[1].id,
                        rotulo: repetido.rotulo,
                      })
                    }
                    sx={{ minHeight: toque.confortavel }}
                  >
                    Renomear
                  </Button>
                </Stack>
              ))}
            </Stack>
          </Alert>
        ) : null}

        <ToggleButtonGroup
          value={filtro}
          exclusive
          onChange={(_, valor) => valor && setFiltro(valor as Filtro)}
          sx={{ mb: 2, flexWrap: "wrap" }}
        >
          {FILTROS.map(opcao => (
            <ToggleButton
              key={opcao.valor}
              value={opcao.valor}
              sx={{ minHeight: toque.confortavel }}
            >
              {opcao.rotulo}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Box
          component="section"
          role="region"
          aria-labelledby={idDaGrade}
          aria-busy={grade.carregando}
        >
          {conteudoDaGrade}
        </Box>
      </Box>

      {/**
       * A CONFIRMAÇÃO EXISTE AQUI, e no caminho do convidado não existe.
       *
       * A regra se inverte de propósito: quem apaga aqui **não é dono da foto**,
       * e a pergunta nomeia o item. No álbum do convidado a confirmação em dois
       * passos é proibida (H-10) — atrito para apagar a própria foto é atrito na
       * hora errada.
       *
       * E a frase de exclusão vem **enumerada**, com os três limites, porque
       * aqui existe diálogo: a pessoa lê antes de decidir. No toast do convidado
       * ela vem comprimida em "quem já viu, já viu" — a mesma verdade no único
       * formato que cabe num toast que não pode cobrir a grade.
       */}
      <FolhaOuDialogo
        aberta={emFoco !== null}
        aoFechar={() => setEmFoco(null)}
        destrutiva
        titulo={emFoco?.rotulo ? `Apagar a foto de ${emFoco.rotulo}?` : "Apagar esta foto?"}
        rodape={
          emFoco ? (
            <>
              {podeExcluir ? (
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => void apagar(emFoco)}
                  sx={{ minHeight: toque.confortavel }}
                >
                  Apagar
                </Button>
              ) : null}
              {emFoco.aprovacao !== "recusada" ? (
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => void tirarDoAlbum(emFoco)}
                  sx={{ minHeight: toque.confortavel }}
                >
                  Tirar do álbum
                </Button>
              ) : null}
              {podeExcluir ? (
                <Button
                  variant="text"
                  fullWidth
                  onClick={() => void baixar(emFoco)}
                  sx={{ minHeight: toque.confortavel }}
                >
                  {/* O botão diz QUAL versão está baixando (H-20). Nunca entrega
                      prévia dizendo que é original. */}
                  {emFoco.tem_original ? "Baixar" : "Baixar (versão menor)"}
                </Button>
              ) : null}
              <Button
                variant="text"
                fullWidth
                onClick={() => setEmFoco(null)}
                sx={{ minHeight: toque.confortavel }}
              >
                Manter
              </Button>
            </>
          ) : undefined
        }
      >
        <Typography variant="body1">
          Ela sai do álbum, do telão e do seu painel. Não sai do telão que já mostrou, nem de
          prints que alguém já tenha feito, nem de exportação já baixada.
        </Typography>
      </FolhaOuDialogo>

      <FolhaOuDialogo
        aberta={renomeando !== null}
        aoFechar={() => setRenomeando(null)}
        titulo="Renomear"
        rodape={
          <Button
            variant="contained"
            fullWidth
            onClick={() => void renomear()}
            sx={{ minHeight: toque.confortavel }}
          >
            Salvar
          </Button>
        }
      >
        <TextField
          fullWidth
          label="Nome"
          value={renomeando?.rotulo ?? ""}
          onChange={evento =>
            setRenomeando(anterior =>
              anterior ? { ...anterior, rotulo: evento.target.value } : anterior
            )
          }
        />
      </FolhaOuDialogo>

      <Snackbar
        open={recado !== null}
        autoHideDuration={6000}
        onClose={() => setRecado(null)}
        message={recado ?? ""}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}

export default FotosQueChegaram;
