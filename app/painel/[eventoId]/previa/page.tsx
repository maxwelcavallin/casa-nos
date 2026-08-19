import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PaginaDoEvento } from "@/components/evento/PaginaDoEvento";
import { ALTURA_DA_FAIXA, FaixaDePrevia } from "@/components/painel/site/FaixaDePrevia";
import { podeNoEvento } from "@/lib/autorizacao";
import { buscarEventoPorId } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { registrarErro } from "@/lib/observabilidade";
import { montarSite } from "@/lib/site-publico";
import { sessaoDoEvento } from "@/lib/sessao";
import { largura } from "@/lib/tokens";

/**
 * `/painel/[eventoId]/previa` — A PRÉVIA ANTES DE PUBLICAR (v1.0, V-10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O PROBLEMA QUE ELA RESOLVE, escrito no PRD com a data em que ele apareceu:
 * `buscarEventoPorSlug` exige `publicado = true`. Enquanto o site não está no ar,
 * **ninguém** consegue abri-lo — nem o casal. O único jeito de conferir o
 * resultado era publicar, ou seja, descobrir o erro depois de mandar o link para
 * 150 pessoas.
 *
 * **ELA RENDERIZA O MESMO `PaginaDoEvento`, COM O MESMO `montarSite`.** Não uma
 * cópia, não uma versão simplificada, não um "modo prévia" dentro do componente
 * do site. É por isso que ela obedece, de graça e sem escrever nada, todas as
 * flags que o site obedece: `hora_publicada`, `local_nome_publicado`,
 * `local_revelacao`, seção desligada e seção ligada e vazia. O que a prévia
 * esconde, o site esconde; o que ela mostra, o site mostra — porque é o mesmo
 * código lendo o mesmo banco.
 *
 * **404 E NÃO 403** quando a sessão não pode editar este site, como nas outras
 * telas de painel: o casal do casamento A que receber este link não pode nem
 * descobrir que aquele id existe.
 *
 * **`site.editar` E NÃO `site.publicar`**, como o PRD §7.1 declara: ver o site
 * antes é parte de editá-lo. Quem pode escrever precisa poder conferir.
 *
 * ONDE A PRÉVIA AINDA PODE MENTIR, e nenhum código conserta:
 *   1. A faixa ocupa ~72 px do fundo da janela (ver `FaixaDePrevia`).
 *   2. O navegador é o do casal. Fonte, largura e conexão do convidado são
 *      outras — e disso só o olho humano no aparelho certo dá conta.
 *   3. Ela não prova que o endereço público responde: isso depende de
 *      `publicado` e do domínio, e é a V-11.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Título literal (RN-31): sem nome de casal, sem data. E `noindex` como em toda
  // tela de painel — esta é a única que mostra o site inteiro sem ele estar no
  // ar, e um buscador que a indexasse publicaria o que o casal ainda não quis.
  title: "A prévia do site",
  robots: { index: false, follow: false },
};

export default async function PaginaDaPrevia({
  params,
}: {
  params: Promise<{ eventoId: string }>;
}) {
  const { eventoId } = await params;
  // Antes de qualquer consulta (`dados.md` §3).
  if (!ehUuid(eventoId)) notFound();

  const evento = await buscarEventoPorId(eventoId);
  if (!evento) notFound();

  const sessao = await sessaoDoEvento(evento.id);
  if (podeNoEvento(sessao, "site.editar", evento) === "nao") notFound();

  /**
   * O ESTADO DE ERRO É EXPLÍCITO, e é o único lugar do painel que faz isso.
   *
   * A V-10 pede: *"falha de leitura mostra o motivo, nunca uma página em
   * branco"*. Sem este `try`, uma consulta que falhe sobe até a plataforma e o
   * casal recebe a tela genérica de erro do Next — que não diz o que aconteceu,
   * não diz se o site no ar foi afetado (não foi: ler não escreve nada) e não
   * oferece saída. Numa noite antes do casamento, isso é a diferença entre "deu
   * problema no meu site" e "não consegui ver agora".
   *
   * O erro vai para `eventos_de_erro` pelo mesmo canal das rotas: uma falha que
   * ninguém lê é uma falha que ninguém conserta.
   */
  let dados: Awaited<ReturnType<typeof montarSite>>;
  try {
    dados = await montarSite(evento);
  } catch (falha) {
    await registrarErro({
      origem: "servidor",
      rota: "/painel/[eventoId]/previa",
      sessaoTipo: sessao.tipo,
      eventoId: evento.id,
      tipoErro: "servidor",
      classe: falha instanceof Error ? falha.name : typeof falha,
      mensagem: falha instanceof Error ? falha.message : String(falha),
      httpStatus: 500,
    });

    return (
      <Box component="main" sx={{ minHeight: "100dvh" }}>
        <Box sx={{ maxWidth: largura.conteudo, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
          <Stack sx={{ gap: 2 }}>
            <Alert severity="error">
              <AlertTitle>Não deu para montar a prévia agora</AlertTitle>
              A leitura do conteúdo do site falhou. Nada foi alterado — ver a
              prévia não muda nada no que está guardado, nem no que está no ar.
              Tente de novo em alguns instantes.
            </Alert>
            <Link href={`/painel/${evento.id}/site`}>Voltar para o painel</Link>
          </Stack>
        </Box>
      </Box>
    );
  }

  return (
    <>
      {/* `medir={false}`: a prévia é do casal e não pode contaminar a medição do
          site (V-10). É a única diferença entre esta tela e o site de verdade. */}
      <PaginaDoEvento {...dados} medir={false} />

      {/* O espaçador devolve, no fim da página, a altura que a faixa fixa ocupa
          — para o rodapé do casal não terminar debaixo dela. Ele fica DEPOIS do
          site, então não desloca nada acima. */}
      <Box aria-hidden sx={{ height: ALTURA_DA_FAIXA }} />

      <FaixaDePrevia eventoId={evento.id} publicado={evento.publicado} />
    </>
  );
}
