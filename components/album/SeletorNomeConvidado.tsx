"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";

import { FolhaOuDialogo } from "@/components/FolhaOuDialogo";
import { filtrarPorNome, type ConvidadoPublico } from "@/lib/convidados";
import { toque } from "@/lib/tokens";

/**
 * `SeletorNomeConvidado` (design system §16.7) — o nome, perguntado DEPOIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELA ABRE COM O ENVIO JÁ CORRENDO, E FECHAR NÃO CANCELA NADA (H-09, RN-02).
 *
 * Nada bloqueia o envio: nem nome, nem visibilidade, nem termo, nem confirmação.
 * Toda decisão acontece com a foto já subindo. Fechar a folha mantém o envio e
 * credita as fotos a "Convidado" — e isso é um caminho válido, não uma falha.
 *
 * Por isso o botão de saída é `Agora não`, um `Button variant="text"` com alvo
 * de 48 **ao lado do confirmar** — nunca um link cinza pequeno. A saída precisa
 * parecer uma saída.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A BUSCA NUNCA VAI À REDE. Filtra no cliente, sem acento e sem caixa, a partir
 * de 1 caractere. Por isso **não existe estado de "buscando"** e não existe
 * esqueleto de lista — e por isso a identificação funciona offline, que é o
 * ponto inteiro da decisão P7: no salão sem rede, é a diferença entre o nome ser
 * escolhido e o nome ser digitado.
 *
 * O ESTADO QUE NÃO É DESENHADO PORQUE NÃO PODE EXISTIR (RN-23): "este nome já
 * foi escolhido", numeração automática, sobrenome inventado, linha desabilitada.
 * Uma entrada pode ser reivindicada quantas vezes for — em casamento, duas Anas
 * Silva acontecem, e bloquear cria um beco sem saída no meio da festa.
 */

export type ResultadoDaIdentificacao =
  | { modo: "lista"; convidadoId: string; rotulo: string }
  | { modo: "avulso"; rotulo: string };

export type PropriedadesDoSeletor = {
  aberta: boolean;
  aoFechar: () => void;
  /** A lista do evento. Vazia = evento sem lista importada. */
  convidados: ConvidadoPublico[];
  /** Preenche o campo ao abrir, quando a pessoa já se identificou antes. */
  inicial?: string;
  aoConfirmar: (resultado: ResultadoDaIdentificacao) => void;
  /** Mensagem de uma tentativa anterior que não salvou. Nunca bloqueia a folha. */
  aviso?: string | null;
};

export function SeletorNomeConvidado({
  aberta,
  aoFechar,
  convidados,
  inicial = "",
  aoConfirmar,
  aviso = null,
}: PropriedadesDoSeletor) {
  const [busca, setBusca] = useState(inicial);
  const [escolhido, setEscolhido] = useState<ConvidadoPublico | null>(null);

  const temLista = convidados.length > 0;
  const filtrados = useMemo(() => filtrarPorNome(convidados, busca), [convidados, busca]);
  const digitado = busca.trim();

  function confirmar() {
    if (escolhido) {
      aoConfirmar({ modo: "lista", convidadoId: escolhido.id, rotulo: escolhido.nome });
      return;
    }
    if (digitado !== "") aoConfirmar({ modo: "avulso", rotulo: digitado });
  }

  return (
    <FolhaOuDialogo
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Suas fotos já estão indo"
      descricao="Diz quem você é para o casal saber de quem é a foto."
      rodape={
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="contained"
            onClick={confirmar}
            disabled={digitado === "" && escolhido === null}
            sx={{ flex: 1, minHeight: toque.confortavel }}
          >
            Sou eu
          </Button>
          {/* `text`, mas com alvo de 48 e ao lado do confirmar. Fechar mantém o
              envio, e a saída precisa parecer uma saída. */}
          <Button
            variant="text"
            onClick={aoFechar}
            sx={{ minWidth: 120, minHeight: toque.confortavel }}
          >
            Agora não
          </Button>
        </Box>
      }
    >
      {aviso ? (
        <Box
          role="status"
          sx={{ bgcolor: "warning.light", color: "text.primary", p: 1.5, mb: 2 }}
        >
          {/* `warningBg`, não `errorBg`: o que aconteceu foi o adiamento de um
              dado secundário enquanto a coisa principal — as fotos — segue. */}
          <Typography variant="body2">{aviso}</Typography>
        </Box>
      ) : null}

      {/* `label` de verdade, sempre. `placeholder` não é rótulo: ele some quando
          a pessoa digita, e some justamente quando ela precisa conferir. */}
      <TextField
        label="Seu nome"
        placeholder={temLista ? "Procure seu nome" : undefined}
        value={busca}
        onChange={evento => {
          setBusca(evento.target.value);
          // Digitar depois de escolher desfaz a escolha: o que está no campo é o
          // que vale, e um nome escolhido que continuasse valendo por baixo do
          // texto digitado seria uma escolha invisível.
          setEscolhido(null);
        }}
        fullWidth
        autoComplete="off"
      />

      {temLista ? (
        <List sx={{ mt: 1 }}>
          {/**
           * A PRIMEIRA LINHA É SEMPRE `Usar "…"` com o que foi digitado. Nome
           * fora da lista é **um toque**, não um caminho alternativo escondido
           * atrás de um link — e é assim que o convidado que não está na lista
           * (ou está com o nome escrito diferente) não fica sem saída.
           */}
          {digitado !== "" ? (
            <>
              <ListItemButton
                selected={escolhido === null}
                onClick={() => setEscolhido(null)}
                sx={{ minHeight: toque.confortavel }}
              >
                <ListItemText primary={`Usar "${digitado}"`} />
              </ListItemButton>
              <Divider component="li" />
            </>
          ) : null}

          {filtrados.map((convidado, indice) => (
            <Box component="li" key={convidado.id} sx={{ display: "block" }}>
              <ListItemButton
                // `selected` pinta o fundo com `action.selected` E o visto vem
                // do próprio estado — nunca só a borda (§9 do design system).
                selected={escolhido?.id === convidado.id}
                onClick={() => setEscolhido(convidado)}
                sx={{ minHeight: toque.confortavel }}
              >
                <ListItemText primary={convidado.nome} />
              </ListItemButton>
              {indice < filtrados.length - 1 ? <Divider /> : null}
            </Box>
          ))}

          {filtrados.length === 0 && digitado !== "" ? (
            <Box sx={{ py: 2 }}>
              {/* "Não encontramos", nunca "você digitou errado". A culpa não é
                  dele — e pode ser que o nome dele não esteja mesmo na lista. */}
              <Typography variant="body1">Não encontramos esse nome na lista.</Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Pode escrever do seu jeito:
              </Typography>
            </Box>
          ) : null}
        </List>
      ) : null}
      {/**
       * SEM LISTA: **só o campo**, e nada que mencione que existe uma lista
       * (H-09). Nem "a lista está vazia", nem "meu nome não está na lista" — o
       * link só existe quando existe uma lista de onde faltar. Dizer ao convidado
       * que há uma lista em que ele não está é criar um problema que ele não tem.
       */}
    </FolhaOuDialogo>
  );
}

export default SeletorNomeConvidado;
