"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";

import { FaixaVisaoDono } from "@/components/painel/FaixaVisaoDono";
import {
  PublicacaoDoSite,
  type DadosDaPublicacao,
} from "@/components/painel/site/PublicacaoDoSite";
import type { ChaveDeSecao } from "@/lib/secoes";
import { largura, toque } from "@/lib/tokens";

/**
 * A CASA DO EDITOR DO SITE (v1.0, V-02 e V-03).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * É PARA CÁ QUE O LINK DO E-MAIL LEVA. A tela lista as sete seções na ordem
 * atual, diz **o que há dentro de cada uma em uma linha**, e marca as que estão
 * ligadas e vazias — que é o que responde "o que eu faço agora?" para quem tem
 * cinco minutos antes de dormir.
 *
 * **ESTA TELA NAVEGA E RESUME. QUEM EDITA É O EDITOR DE SEÇÃO.** O único ato de
 * escrita daqui é ligar/desligar e ordenar, e ele é um `PATCH` com a lista
 * inteira (RV-05) — nunca uma requisição por toque. Numa conexão de celular à
 * noite, N requisições parciais deixam a ordem inconsistente no meio.
 *
 * **ARRASTAR-E-SOLTAR ESTÁ FORA, DE PROPÓSITO** (prd-v1 §2.2). Arrastar em
 * lista, no celular, com leitor de tela, é o padrão de acessibilidade mais caro
 * que existe. Subir/descer funciona no dedo, no teclado e no rotor — e cada
 * botão tem `aria-label` que diz o que ele move.
 *
 * **REVERSÃO OTIMISTA COM MENSAGEM ESPECÍFICA.** A lista muda na hora e volta ao
 * estado anterior se a API falhar. "Não deu para salvar a ordem agora" e não
 * "erro": a segunda não diz nem o que falhou nem o que sobrou.
 *
 * LARGURA TRATADA por teto centralizado (`largura.conteudo`, 960), que é a
 * medida de formulário do painel. **Mobile primeiro** (RV-18): a Marina organiza
 * tudo do celular.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type LinhaDeSecao = {
  chave: ChaveDeSecao;
  nome: string;
  explicacao: string;
  resumo: string;
  faltaPreencher: boolean;
  podeDesligar: boolean;
  /**
   * A seção já tem editor? Enquanto não tiver, o nome dela **não é link** — e o
   * endereço dela responde 404. Um link que abre uma tela que não edita nada é a
   * meia funcionalidade que esta versão existe para não ter.
   */
  temEditor: boolean;
  /** `capa` e `rodape` não entram na reordenação. */
  fixa: boolean;
  ativa: boolean;
  ordem: number;
};

export type DadosDoPainelDoSite = {
  eventoId: string;
  nomeCasal: string;
  /** O endereço do site, para o casal saber onde isto aparece. */
  slug: string;
  publicado: boolean;
  ehDono: boolean;
  secoes: LinhaDeSecao[];
  /**
   * O bloco de publicar/tirar do ar (V-11). Ele mora nesta tela, e não numa
   * própria: publicar é a última coisa que o casal faz depois de olhar a lista
   * de seções, e uma tela separada poria um clique entre a conferência e a
   * decisão.
   */
  publicacao: DadosDaPublicacao;
};

export function PainelDoSite({ dados }: { dados: DadosDoPainelDoSite }) {
  const [secoes, setSecoes] = useState(dados.secoes);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const moveis = secoes.filter(s => !s.fixa);
  const faltando = secoes.filter(s => s.ativa && s.faltaPreencher).length;

  /**
   * Manda a lista INTEIRA e repinta com o que o servidor devolveu.
   *
   * O estado anterior viaja por parâmetro para a reversão ser exata: ler
   * `secoes` aqui dentro pegaria o estado já otimista, e a reversão devolveria a
   * tela ao estado errado.
   */
  async function salvar(proximas: LinhaDeSecao[], anteriores: LinhaDeSecao[], oQue: string) {
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/eventos/${dados.eventoId}/site/secoes`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          secoes: proximas.map(s => ({ chave: s.chave, ativa: s.ativa, ordem: s.ordem })),
        }),
      });
      if (!resposta.ok) throw new Error(String(resposta.status));

      const corpo = (await resposta.json()) as {
        secoes?: Array<{ chave: string; ativa: boolean; ordem: number }>;
      };
      const doServidor = new Map((corpo.secoes ?? []).map(s => [s.chave, s]));
      setSecoes(
        proximas.map(s => {
          const guardada = doServidor.get(s.chave);
          return guardada ? { ...s, ativa: guardada.ativa, ordem: guardada.ordem } : s;
        })
      );
    } catch {
      setSecoes(anteriores);
      setErro(`Não deu para salvar ${oQue} agora. Nada mudou no seu site.`);
    } finally {
      // O desligamento no `finally`, e nenhum `return` de guarda antes dele
      // (`stack.md` §6): um caminho de saída que não desligue deixaria o botão
      // travado para sempre, sem erro e sem nada no console.
      setSalvando(false);
    }
  }

  function alternar(chave: ChaveDeSecao) {
    const anteriores = secoes;
    const proximas = secoes.map(s => (s.chave === chave ? { ...s, ativa: !s.ativa } : s));
    setSecoes(proximas);
    void salvar(proximas, anteriores, "essa mudança");
  }

  function mover(chave: ChaveDeSecao, direcao: -1 | 1) {
    const indice = moveis.findIndex(s => s.chave === chave);
    const destino = indice + direcao;
    if (indice === -1 || destino < 0 || destino >= moveis.length) return;

    const reordenadas = [...moveis];
    [reordenadas[indice], reordenadas[destino]] = [reordenadas[destino], reordenadas[indice]];

    /**
     * A ordem é REESCRITA de 1 a N, e não trocada entre as duas linhas.
     *
     * Trocar os números funcionaria enquanto eles fossem distintos. Um evento
     * cujas cinco seções nunca foram tocadas tem os números do catálogo; um que
     * veio de um estado antigo pode ter empates. Reescrever a sequência inteira
     * torna a ordem do casal independente do que havia antes.
     */
    const comOrdem = reordenadas.map((s, i) => ({ ...s, ordem: i + 1 }));
    const fixas = secoes.filter(s => s.fixa);
    const proximas = [
      ...fixas.filter(s => s.ordem <= 0),
      ...comOrdem,
      ...fixas.filter(s => s.ordem > 0),
    ];

    const anteriores = secoes;
    setSecoes(proximas);
    void salvar(proximas, anteriores, "a ordem");
  }

  return (
    <Box component="main" sx={{ minHeight: "100dvh" }}>
      {dados.ehDono ? <FaixaVisaoDono /> : null}

      <Box sx={{ maxWidth: largura.conteudo, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        <Stack sx={{ gap: 3 }}>
          <Stack sx={{ gap: 1 }}>
            <Typography variant="h3" component="h1">
              O site de vocês
            </Typography>
            <Typography variant="body1">
              {faltando === 0
                ? "Toque numa seção para mudar o que ela mostra. Desligue as que vocês não querem contar."
                : faltando === 1
                  ? "Uma seção está ligada e ainda vazia — enquanto estiver assim, ela não aparece no site."
                  : `${faltando} seções estão ligadas e ainda vazias — enquanto estiverem assim, elas não aparecem no site.`}
            </Typography>
            {/* O nome do casal em `caption`: identifica de qual casamento é o
                painel, sem competir com o título (design system §17.6). */}
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              {dados.nomeCasal}
              {dados.publicado ? " · no ar" : " · ainda não publicado"}
            </Typography>
          </Stack>

          <PublicacaoDoSite dados={dados.publicacao} />

          {erro ? (
            /**
             * Mensagem específica e com o caminho de saída (design system §17.3).
             * Ela vive aqui, e não num campo, porque a falha é do ato inteiro —
             * não há campo a que ela pertença.
             */
            <Alert severity="error" onClose={() => setErro(null)}>
              {erro}
            </Alert>
          ) : null}

          <Card>
            <Stack divider={<Divider />}>
              {secoes.map((secao, indice) => {
                const posicaoEntreMoveis = moveis.findIndex(m => m.chave === secao.chave);
                return (
                  <Stack
                    key={secao.chave}
                    direction={{ xs: "column", sm: "row" }}
                    sx={{
                      gap: 1.5,
                      px: 2,
                      py: 2,
                      alignItems: { xs: "stretch", sm: "center" },
                    }}
                  >
                    <Stack sx={{ gap: 0.5, flex: 1, minWidth: 0 }}>
                      <Stack
                        direction="row"
                        sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}
                      >
                        {secao.temEditor ? (
                          <Link
                            href={`/painel/${dados.eventoId}/site/${secao.chave}`}
                            variant="subtitle1"
                            // O nome inteiro é o alvo, e ele tem 44 px de altura:
                            // um link de uma palavra numa lista é o alvo mais
                            // errado do celular.
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              minHeight: toque.minimo,
                            }}
                          >
                            {secao.nome}
                          </Link>
                        ) : (
                          <Typography variant="subtitle1" component="h2">
                            {secao.nome}
                          </Typography>
                        )}
                        {secao.ativa && secao.faltaPreencher ? (
                          /* COR NÃO É O ÚNICO SINAL: o estado tem rótulo escrito
                             (§10 da régua de acessibilidade). */
                          <Chip size="small" color="warning" label="falta preencher" />
                        ) : null}
                        {!secao.ativa ? <Chip size="small" label="desligada" /> : null}
                      </Stack>

                      <Typography
                        variant="body2"
                        sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                      >
                        {secao.resumo}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.disabled" }}>
                        {secao.explicacao}
                      </Typography>
                    </Stack>

                    <Stack direction="row" sx={{ gap: 0.5, alignItems: "center" }}>
                      {secao.fixa ? (
                        // Sem botão de mover: `capa` e `rodape` têm posição
                        // travada, e um botão desabilitado convida a apertar.
                        <Typography variant="caption" sx={{ color: "text.disabled", px: 1 }}>
                          {indice === 0 ? "sempre em cima" : "sempre embaixo"}
                        </Typography>
                      ) : (
                        <>
                          <IconButton
                            aria-label={`Subir a seção ${secao.nome}`}
                            onClick={() => mover(secao.chave, -1)}
                            disabled={salvando || posicaoEntreMoveis === 0}
                            sx={{ minWidth: toque.minimo, minHeight: toque.minimo }}
                          >
                            <ArrowUp size={18} aria-hidden />
                          </IconButton>
                          <IconButton
                            aria-label={`Descer a seção ${secao.nome}`}
                            onClick={() => mover(secao.chave, 1)}
                            disabled={salvando || posicaoEntreMoveis === moveis.length - 1}
                            sx={{ minWidth: toque.minimo, minHeight: toque.minimo }}
                          >
                            <ArrowDown size={18} aria-hidden />
                          </IconButton>
                        </>
                      )}

                      {secao.podeDesligar ? (
                        <Switch
                          checked={secao.ativa}
                          onChange={() => alternar(secao.chave)}
                          disabled={salvando}
                          slotProps={{
                            input: {
                              "aria-label": `Mostrar a seção ${secao.nome} no site`,
                            },
                          }}
                        />
                      ) : (
                        // O interruptor NÃO EXISTE (RV-06), em vez de existir
                        // desabilitado. Um site de casamento sem a capa não é um
                        // site de casamento, e o rodapé carrega a única marca da
                        // página.
                        <Typography variant="caption" sx={{ color: "text.disabled", px: 1 }}>
                          sempre no ar
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                );
              })}
            </Stack>
          </Card>

          {/* O endereço saiu daqui na V-11: ele é do bloco de publicação, que o
              mostra por extenso, com o domínio quando houver, e com botão de
              copiar. Escrito nos dois lugares, um dos dois ficaria desatualizado
              — e seria este, que não sabe se existe domínio. */}
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Seção desligada some do site e o conteúdo dela continua guardado —
            religar traz tudo de volta.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

export default PainelDoSite;
