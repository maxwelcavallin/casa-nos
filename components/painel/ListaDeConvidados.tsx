"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { FaixaVisaoDono } from "@/components/painel/FaixaVisaoDono";
import { enviarEvento } from "@/lib/analytics";
import type { LinhaRecusada } from "@/lib/convidados";
import { largura, tipografiaNumeros, toque } from "@/lib/tokens";

/**
 * A LISTA DE CONVIDADOS (H-03) — **o denominador da North Star**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEM ELA, P NÃO EXISTE. A métrica que decide este produto é "quantos slots de
 * convidado publicaram pelo menos uma foto" — e sem uma lista de slots não há
 * denominador, `guest_identified` não tem o modo `lista`, e os critérios de
 * término da fatia viram opinião.
 *
 * É por isso que uma tela de colar nomes está numa fatia que, fora isso, é toda
 * sobre a foto chegar. Ela não é gestão de convidados (isso é a Fatia 2): é uma
 * caixa de texto e uma lista.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O ESTADO VAZIO É A TELA MAIS IMPORTANTE DAQUI: a caixa de colar **já aberta**,
 * com um exemplo de duas linhas dentro. O exemplo é `placeholder` de conteúdo,
 * e o `label` é de verdade e fica acima — `placeholder` não é rótulo, ele some
 * quando a pessoa digita.
 *
 * LARGURA TRATADA por teto centralizado: `largura.conteudo` (960), que é a
 * medida de formulário do painel.
 */

export type SlotDaLista = {
  id: string;
  nome: string;
  pessoasNoSlot: number;
  ausente: boolean | null;
};

export type DadosDaLista = {
  eventoId: string;
  convidados: SlotDaLista[];
  /** `true` depois de `fim_festa_em`. Antes disso, marcar ausência não faz sentido. */
  festaTerminou: boolean;
  ehDono: boolean;
};

const EXEMPLO = "Ana Paula Ribeiro\nFamília Silva, 4";

export function ListaDeConvidados({ dados }: { dados: DadosDaLista }) {
  const [convidados, setConvidados] = useState(dados.convidados);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [recusadas, setRecusadas] = useState<LinhaRecusada[]>([]);
  const [repetidos, setRepetidos] = useState<string[]>([]);
  const [resultado, setResultado] = useState<{ criados: number; jaExistiam: number } | null>(
    null
  );
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [aApagar, setAApagar] = useState<SlotDaLista | null>(null);

  const slots = convidados.length;
  const pessoas = convidados.reduce((total, c) => total + c.pessoasNoSlot, 0);
  const vazia = slots === 0;

  async function importar() {
    setSalvando(true);
    setErroGeral(null);
    try {
      const resposta = await fetch(`/api/eventos/${dados.eventoId}/convidados`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const corpo = (await resposta.json()) as {
        erro?: string;
        detalhe?: { recusadas?: LinhaRecusada[] };
        criados?: number;
        ja_existiam?: number;
        recusadas?: LinhaRecusada[];
        repetidos?: string[];
        convidados?: Array<{
          id: string;
          nome: string;
          pessoas_no_slot: number;
          ausente: boolean | null;
        }>;
      };

      if (!resposta.ok) {
        // Nenhuma linha aproveitável: as recusadas voltam com o motivo, e o
        // texto CONTINUA na caixa. Um alerta genérico faria a noiva olhar para
        // 300 nomes sem saber qual deles a máquina não entendeu.
        setRecusadas(corpo.detalhe?.recusadas ?? []);
        if ((corpo.detalhe?.recusadas ?? []).length === 0) {
          setErroGeral("Não conseguimos salvar agora. O que você colou continua aqui.");
        }
        return;
      }

      setRecusadas(corpo.recusadas ?? []);
      setRepetidos(corpo.repetidos ?? []);
      setResultado({ criados: corpo.criados ?? 0, jaExistiam: corpo.ja_existiam ?? 0 });
      setConvidados(
        (corpo.convidados ?? []).map(c => ({
          id: c.id,
          nome: c.nome,
          pessoasNoSlot: c.pessoas_no_slot,
          ausente: c.ausente,
        }))
      );

      /**
       * As linhas que não viraram nome **voltam para a caixa já preenchidas**, e
       * as que entraram saem dela. Quem colou 300 linhas de uma planilha não vai
       * reencontrar quatro no meio dela.
       */
      setTexto((corpo.recusadas ?? []).map(r => r.original).join("\n"));

      enviarEvento("guest_list_imported", {
        wedding_id: dados.eventoId,
        // SLOTS, e não pessoas: é o denominador da North Star, e somar as duas
        // grandezas produziria um percentual que não significa nada.
        guest_count: (corpo.convidados ?? []).length,
        import_mode: "colado",
      });
    } catch {
      setErroGeral("Não conseguimos salvar agora. O que você colou continua aqui.");
    } finally {
      // O desligamento no `finally`, e o guarda (se houvesse) dentro do `try`:
      // um `return` antes daqui deixaria a tela em esqueleto para sempre, sem
      // erro e sem nada no console (`stack.md` §6, RN-30).
      setSalvando(false);
    }
  }

  async function apagar(slot: SlotDaLista) {
    setAApagar(null);
    const antes = convidados;
    setConvidados(atual => atual.filter(c => c.id !== slot.id));
    try {
      const resposta = await fetch(
        `/api/eventos/${dados.eventoId}/convidados/${slot.id}`,
        { method: "DELETE" }
      );
      if (!resposta.ok) throw new Error(String(resposta.status));
    } catch {
      setConvidados(antes);
      setErroGeral("Não conseguimos apagar agora. O nome continua na lista.");
    }
  }

  async function marcarAusente(slot: SlotDaLista, ausente: boolean) {
    const antes = convidados;
    setConvidados(atual =>
      atual.map(c => (c.id === slot.id ? { ...c, ausente } : c))
    );
    try {
      const resposta = await fetch(
        `/api/eventos/${dados.eventoId}/convidados/${slot.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ausente }),
        }
      );
      if (!resposta.ok) throw new Error(String(resposta.status));
    } catch {
      setConvidados(antes);
    }
  }

  return (
    <Box component="main" sx={{ minHeight: "100dvh" }}>
      {dados.ehDono ? <FaixaVisaoDono /> : null}

      <Box sx={{ maxWidth: largura.conteudo, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        <Stack sx={{ gap: 3 }}>
          <Stack sx={{ gap: 1 }}>
            <Typography variant="h3" component="h1">
              {vazia ? "Cole a sua lista aqui" : "Sua lista de convidados"}
            </Typography>
            <Typography variant="body1">
              {vazia
                ? "Um nome por linha. Se for uma família, escreva o número de pessoas depois da vírgula."
                : "Serve para o convidado se reconhecer no álbum e para você saber, depois, quantos participaram."}
            </Typography>
          </Stack>

          {!vazia ? (
            <Stack direction="row" sx={{ gap: 3, flexWrap: "wrap" }}>
              {/* AS DUAS GRANDEZAS, NUNCA SOMADAS: slots é o denominador da
                  North Star; pessoas é a banda do erro E1. */}
              <Typography variant="h5" sx={{ ...tipografiaNumeros }}>
                {slots === 1 ? "1 nome na lista" : `${slots} nomes na lista`}
              </Typography>
              <Typography
                variant="h5"
                sx={{ ...tipografiaNumeros, color: "text.secondary" }}
              >
                {pessoas === 1 ? "1 pessoa ao todo" : `${pessoas} pessoas ao todo`}
              </Typography>
            </Stack>
          ) : null}

          {repetidos.length > 0 ? (
            <Box
              role="status"
              sx={{ bgcolor: "action.selected", color: "text.primary", p: 2, borderRadius: 1 }}
            >
              {/* AVISA, NÃO BLOQUEIA (RN-23). O banco não tem índice único por
                  nome de propósito: dois "Tio Carlos" acontecem em toda festa, e
                  bloquear cria um beco sem saída no meio do casamento. */}
              <Typography variant="body2">
                {repetidos.length === 1
                  ? `Dois nomes iguais: ${repetidos[0]}. Deixamos os dois, porque em casamento isso acontece.`
                  : `Nomes iguais: ${repetidos.join(", ")}. Deixamos todos, porque em casamento isso acontece.`}
              </Typography>
            </Box>
          ) : null}

          {recusadas.length > 0 ? (
            <Stack sx={{ gap: 1 }}>
              <Box sx={{ bgcolor: "warning.light", color: "text.primary", p: 2 }}>
                <Typography variant="body2">
                  {resultado
                    ? `${resultado.criados + resultado.jaExistiam} linhas entraram. Estas ${recusadas.length} a gente não entendeu:`
                    : `Estas ${recusadas.length} linhas a gente não entendeu:`}
                </Typography>
              </Box>
              <Card>
                <Stack component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                  {recusadas.map((linha, indice) => (
                    <Box component="li" key={`${linha.original}:${indice}`}>
                      <Stack
                        direction="row"
                        sx={{
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 2,
                          minHeight: 56,
                          px: 2,
                        }}
                      >
                        <Typography variant="body1">{linha.original}</Typography>
                        {/* O erro fica AO LADO DA LINHA — nunca um alerta no
                            topo resumindo o que aconteceu embaixo. */}
                        <Typography variant="body2" sx={{ color: "error.main" }}>
                          {linha.motivo}
                        </Typography>
                      </Stack>
                      {indice < recusadas.length - 1 ? <Divider /> : null}
                    </Box>
                  ))}
                </Stack>
              </Card>
            </Stack>
          ) : null}

          {erroGeral ? (
            <Typography variant="body2" sx={{ color: "error.main" }}>
              {erroGeral}
            </Typography>
          ) : null}

          <TextField
            label="Sua lista de convidados"
            // O exemplo desaparece ao primeiro caractere; o `label` não. É por
            // isso que ele é `placeholder` e o rótulo é de verdade.
            placeholder={EXEMPLO}
            value={texto}
            onChange={evento => setTexto(evento.target.value)}
            multiline
            minRows={4}
            fullWidth
          />

          <Button
            variant="contained"
            onClick={() => void importar()}
            disabled={salvando || texto.trim() === ""}
            sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
          >
            Criar a lista
          </Button>

          {resultado && recusadas.length === 0 ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {resultado.criados} {resultado.criados === 1 ? "nome novo entrou" : "nomes novos entraram"}
              . {resultado.jaExistiam}{" "}
              {resultado.jaExistiam === 1 ? "já estava na lista" : "já estavam na lista"}.
            </Typography>
          ) : null}

          {!vazia ? (
            <Card>
              <Stack component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                {convidados.map((slot, indice) => (
                  <Box component="li" key={slot.id}>
                    <Stack
                      direction="row"
                      sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                        minHeight: 56,
                        px: 2,
                      }}
                    >
                      <Typography
                        variant="body1"
                        sx={{ color: slot.ausente ? "text.secondary" : "text.primary" }}
                      >
                        {slot.nome}
                        {slot.pessoasNoSlot > 1 ? (
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ color: "text.secondary", ml: 1, ...tipografiaNumeros }}
                          >
                            · {slot.pessoasNoSlot} pessoas
                          </Typography>
                        ) : null}
                        {slot.ausente ? (
                          <Chip size="small" label="Não foi" sx={{ ml: 1 }} />
                        ) : null}
                      </Typography>
                      <Stack direction="row" sx={{ gap: 1 }}>
                        {/* "Não foi" SÓ EXISTE DEPOIS DA FESTA. Antes dela,
                            marcar ausência não faz sentido e o controle não
                            existe — nem desabilitado. */}
                        {dados.festaTerminou ? (
                          <Button
                            variant="text"
                            onClick={() => void marcarAusente(slot, !slot.ausente)}
                            sx={{ minHeight: toque.minimo }}
                          >
                            {slot.ausente ? "Foi" : "Não foi"}
                          </Button>
                        ) : null}
                        <Button
                          variant="text"
                          onClick={() => setAApagar(slot)}
                          sx={{ minHeight: toque.minimo }}
                        >
                          Apagar
                        </Button>
                      </Stack>
                    </Stack>
                    {indice < convidados.length - 1 ? <Divider /> : null}
                  </Box>
                ))}
              </Stack>
            </Card>
          ) : null}
        </Stack>
      </Box>

      {/**
       * A pergunta CONTÉM O NOME DO ITEM (§11 do padrão da casa), nunca "Tem
       * certeza?". E ela diz a consequência que a noiva não teria como adivinhar:
       * um slot excluído que já tem mídia **continua contando** na medição da
       * janela do evento.
       */}
      <Dialog open={aApagar !== null} onClose={() => setAApagar(null)}>
        <DialogTitle>{aApagar ? `Apagar ${aApagar.nome} da lista?` : ""}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Se ela já mandou fotos, elas continuam no álbum e continuam contando.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => aApagar && void apagar(aApagar)}>
            Apagar
          </Button>
          <Button variant="text" onClick={() => setAApagar(null)}>
            Manter
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** O esqueleto de lista da tela (§17.3): a forma do conteúdo real, nunca spinner. */
export function EsqueletoDaLista() {
  return (
    <Stack sx={{ gap: 2, maxWidth: largura.conteudo, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
      <Skeleton variant="text" width={320} height={40} />
      <Stack direction="row" sx={{ gap: 3 }}>
        <Skeleton variant="text" width={180} height={32} />
        <Skeleton variant="text" width={180} height={32} />
      </Stack>
      <Card>
        <Stack sx={{ p: 2, gap: 2 }}>
          {["40%", "30%", "52%", "36%", "44%"].map(largura => (
            <Skeleton key={largura} variant="text" width={largura} />
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

export default ListaDeConvidados;
