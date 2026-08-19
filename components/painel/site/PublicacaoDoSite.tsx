"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Check, Copy, Eye } from "lucide-react";
import { useState } from "react";

import { ApenasParaLeitor } from "@/components/ApenasParaLeitor";
import { FolhaOuDialogo } from "@/components/FolhaOuDialogo";
import { enviarEvento } from "@/lib/analytics";
import { toque } from "@/lib/tokens";

/**
 * PUBLICAR, TIRAR DO AR, E O ENDEREÇO (v1.0, V-11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Ela mora na casa do editor (`/painel/[eventoId]/site`) e não numa tela própria:
 * publicar é a última coisa que o casal faz depois de olhar as seções, e uma
 * tela separada colocaria um clique entre a conferência e a decisão.
 *
 * **A CONFIRMAÇÃO DIZ A CONSEQUÊNCIA, NÃO PEDE CORAGEM.** "Tem certeza?" não
 * informa nada: quem chegou até o botão já tem certeza do que quer, e não sabe é
 * o que vai acontecer. O texto diz as duas metades — o endereço para de
 * responder, **e nada é apagado** —, porque a segunda é o que faz o casal
 * conseguir apertar sem medo, e é verdade (RV-13).
 *
 * **PUBLICAR NÃO PEDE CONFIRMAÇÃO.** A assimetria é deliberada: publicar é
 * reversível num toque (este mesmo card, dois segundos depois), e pedir
 * confirmação para os dois lados ensinaria a atravessar a caixa sem ler — o que
 * estraga justamente a caixa que importa.
 *
 * **A EMENDA DA V-19 ENTROU, E ELA É CONDICIONAL À FOTO.** A galeria mora no
 * prefixo público do balde, e despublicar o site **não** tira o arquivo do ar:
 * quem já guardou a URL de uma foto continua conseguindo abri-la. Mover objeto a
 * objeto ao despublicar foi recusado pelo `po` — é cópia sem transação,
 * disparada por alguém no celular às 23h, e uma falha no meio deixa metade da
 * galeria em cada prefixo. A saída escolhida foi dizer a verdade aqui e oferecer
 * a exclusão da foto como a saída completa (RV-21).
 *
 * **`temFoto` DECIDE, E NÃO "A GALERIA EXISTE".** Com zero foto, as duas frases
 * novas seriam sobre nada: prometer que guardamos fotos que não existem, e
 * avisar sobre endereços de fotos que ninguém tem. É a mesma régua que segurava
 * a frase antes de V-19 — a diferença é que agora ela é por casal, e não por
 * versão do produto.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ESTADO DE ERRO: **o estado volta ao anterior** e a mensagem diz o que
 * aconteceu. É o critério da V-11, e ele é o oposto do padrão fácil (deixar o
 * interruptor onde a pessoa o pôs e mostrar um alerta): um interruptor que diz
 * "no ar" sobre um site que não foi publicado é a mentira mais cara desta tela.
 */

export type DadosDaPublicacao = {
  eventoId: string;
  publicado: boolean;
  /** Já resolvido no servidor: domínio quando houver, `/e/<slug>` quando não. */
  endereco: string;
  /** O mesmo, sem `https://` — é o que se lê e se digita. */
  enderecoParaLer: string;
  /** Verdadeiro quando o endereço acima é um domínio próprio do casal. */
  temDominio: boolean;
  /**
   * Há pelo menos uma foto **armazenada** na galeria (V-19, RV-21).
   *
   * Resolvido no servidor, e só das armazenadas: uma intenção que nunca
   * confirmou não tem objeto no balde e portanto não tem endereço que continue
   * respondendo (RV-25). Avisar sobre ela seria assustar por uma coisa que não
   * existe.
   */
  temFoto: boolean;
};

export function PublicacaoDoSite({ dados }: { dados: DadosDaPublicacao }) {
  const [publicado, setPublicado] = useState(dados.publicado);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function definir(proximo: boolean) {
    const anterior = publicado;
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/eventos/${dados.eventoId}/site/publicacao`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicado: proximo }),
      });
      if (!resposta.ok) throw new Error(String(resposta.status));

      const corpo = (await resposta.json()) as { publicado?: boolean; mudou?: boolean };
      setPublicado(corpo.publicado === true);

      /**
       * **`mudou` VEM DO SERVIDOR, E É ELE QUEM DECIDE SE O EVENTO SAI.**
       *
       * Um `if (!anterior)` aqui pareceria equivalente e não é: dois toques
       * seguidos leem o mesmo `publicado` do estado de React antes de qualquer
       * resposta chegar, e os dois concluiriam que houve transição. O banco
       * decide numa instrução só (`lib/publicacao.ts`), e o GA4 não desconta
       * evento duplicado.
       */
      if (corpo.publicado === true && corpo.mudou === true) {
        enviarEvento("site_published", { wedding_id: dados.eventoId });
      }
    } catch {
      // O estado volta ao anterior: o interruptor não pode afirmar uma coisa que
      // o servidor não gravou.
      setPublicado(anterior);
      /**
       * A REGRA DAS DUAS FRASES (`pmm`, `gtm.md` §5.18): **um erro de publicação
       * precisa dizer em que estado o site ficou.** Quem aperta "publicar", vê
       * um erro e não sabe se publicou pela metade **aperta de novo** — e a
       * segunda tentativa é a que faz estrago. "Nada mudou" responde a pergunta
       * antes de ela ser feita.
       */
      setErro(
        proximo
          ? "Não conseguimos publicar agora. Nada mudou: o site continua fora do ar."
          : "Não conseguimos tirar do ar agora. O site continua no ar."
      );
    } finally {
      // O desligamento no `finally`, e nenhum `return` de guarda antes dele
      // (`stack.md` §6): um caminho de saída que não desligasse deixaria o botão
      // travado para sempre, sem erro e sem nada no console.
      setSalvando(false);
      setConfirmando(false);
    }
  }

  async function copiar() {
    setErro(null);
    try {
      await navigator.clipboard.writeText(dados.endereco);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // `clipboard` falha sem rede nenhuma envolvida: contexto não seguro,
      // permissão negada, navegador antigo. O endereço está escrito logo acima,
      // então a saída existe — e a mensagem aponta para ela.
      setErro(
        "Não conseguimos copiar. O endereço está logo acima: dá para selecionar e copiar à mão."
      );
    }
  }

  return (
    <>
      <Card>
        <Stack sx={{ gap: 2, px: 2, py: 2 }}>
          <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="subtitle1" component="h2">
              O endereço de vocês
            </Typography>
            {/* COR NÃO É O ÚNICO SINAL: o estado tem rótulo escrito (§10 da
                régua de acessibilidade). */}
            {publicado ? (
              <Chip size="small" color="success" label="no ar" />
            ) : (
              <Chip size="small" label="fora do ar" />
            )}
          </Stack>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ gap: 1, alignItems: { xs: "stretch", sm: "center" } }}
          >
            <Typography
              variant="body1"
              sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
            >
              {publicado ? (
                <Link href={dados.endereco} target="_blank" rel="noreferrer">
                  {dados.enderecoParaLer}
                </Link>
              ) : (
                dados.enderecoParaLer
              )}
            </Typography>
            <Button
              variant="outlined"
              onClick={() => void copiar()}
              startIcon={copiado ? <Check size={16} /> : <Copy size={16} />}
              sx={{ minHeight: toque.minimo, flex: "none" }}
            >
              {copiado ? "Copiado" : "Copiar"}
            </Button>

            {/**
             * A TROCA DE RÓTULO É **VISTA**, E PRECISA SER **ANUNCIADA**
             * (`pmm`, `gtm.md` §5.18). Sem isto, quem não vê a tela toca no botão
             * e não recebe confirmação nenhuma — e a área de transferência é
             * justamente o tipo de ação cujo resultado não dá para conferir.
             *
             * Uma região viva separada, e não `aria-live` no próprio botão:
             * anunciar o rótulo do botão que acabou de receber o foco faria o
             * leitor repetir "Copiado, botão" e ninguém saberia se a cópia
             * aconteceu ou se o botão só mudou de nome.
             */}
            <ApenasParaLeitor aoVivo>
              {copiado ? "Endereço copiado." : ""}
            </ApenasParaLeitor>
          </Stack>

          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {publicado
              ? "Quem tiver este link consegue abrir o site de vocês."
              : "Enquanto o site estiver fora do ar, quem abrir este link vê uma página de endereço não encontrado."}
            {dados.temDominio
              ? null
              : " Este é o endereço provisório, e ele continua funcionando depois que o domínio de vocês entrar."}
          </Typography>

          {erro ? (
            /* Mensagem específica e com o caminho de saída (design system §17.3).
               Ela vive aqui, e não num campo, porque a falha é do ato inteiro. */
            <Alert severity="error" onClose={() => setErro(null)}>
              {erro}
            </Alert>
          ) : null}

          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ gap: 1, alignItems: { xs: "stretch", sm: "center" } }}
          >
            {publicado ? (
              <Button
                variant="outlined"
                color="warning"
                onClick={() => setConfirmando(true)}
                disabled={salvando}
                sx={{ minHeight: toque.minimo }}
              >
                Tirar o site do ar
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={() => void definir(true)}
                disabled={salvando}
                sx={{ minHeight: toque.minimo }}
              >
                {salvando ? "Publicando…" : "Publicar o site"}
              </Button>
            )}

            {/**
             * A PRÉVIA (V-10) FICA AO LADO DO BOTÃO DE PUBLICAR de propósito: é
             * o último lugar em que olhar antes vale mais do que desfazer
             * depois.
             *
             * ───────────────────────────────────────────────────────────────
             * **`Ver antes de publicar` FICA FALSA COM O SITE PUBLICADO**, e a
             * escolha de comportamento é minha (`pmm`, `gtm.md` §5.18).
             *
             * **Neste produto não existe rascunho.** `montarSite` lê o banco, e
             * a página pública lê o mesmo `montarSite`: salvar um campo no
             * editor muda o site no ar **na hora**. Não há "mudança não
             * publicada" a conferir, logo não há prévia a ver — e um rótulo que
             * promete conferir antes seria a mesma classe de mentira que o
             * `ninguém mais consegue abrir` era.
             *
             * Com o site no ar, então, o gatilho é `Abrir o site`, e ele leva ao
             * endereço de verdade. Ele repete o link do endereço logo acima de
             * propósito: o endereço está ali para ser lido e copiado, e este
             * está aqui para ser apertado, na altura em que a mão já está.
             * ───────────────────────────────────────────────────────────────
             */}
            <Link
              href={publicado ? dados.endereco : `/painel/${dados.eventoId}/previa`}
              {...(publicado ? { target: "_blank", rel: "noreferrer" } : {})}
              variant="body2"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                minHeight: toque.minimo,
              }}
            >
              <Eye size={16} aria-hidden />
              {publicado ? "Abrir o site" : "Ver antes de publicar"}
            </Link>
          </Stack>
        </Stack>
      </Card>

      <FolhaOuDialogo
        aberta={confirmando}
        aoFechar={() => setConfirmando(false)}
        // Ação destrutiva não fecha por toque no véu (design system §16.5).
        destrutiva
        titulo="Tirar o site do ar?"
        rodape={
          <Stack sx={{ gap: 1 }}>
            <Button
              variant="contained"
              color="warning"
              onClick={() => void definir(false)}
              disabled={salvando}
              sx={{ minHeight: toque.minimo }}
            >
              {salvando ? "Tirando do ar…" : "Tirar do ar"}
            </Button>
            <Button
              variant="text"
              onClick={() => setConfirmando(false)}
              disabled={salvando}
              sx={{ minHeight: toque.minimo }}
            >
              Deixar no ar
            </Button>
          </Stack>
        }
      >
        <Stack sx={{ gap: 1.5 }}>
          <Typography variant="body1">
            O endereço para de responder: quem abrir o link vai ver uma página de
            endereço não encontrado.
          </Typography>
          {/**
           * `Nada é apagado` era **passiva sem dono**: some quem faz a coisa, e
           * some justamente quem a pessoa precisa que seja responsável.
           * `Não apagamos nada` tem sujeito, e o sujeito somos nós (`pmm`,
           * `gtm.md` §5.18).
           *
           * **A EMENDA DA V-19 É UMA PALAVRA, `as fotos`**, na posição em que ela
           * cabe sem reescrever a frase — e o `pmm` a deixou escrita assim de
           * propósito. Com foto na galeria ela é obrigatória: uma lista do que
           * continua guardado que não cite as fotos, numa tela que fala em tirar
           * coisas do ar, é lida como "as fotos não continuam".
           */}
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {dados.temFoto
              ? "Não apagamos nada. O texto, as seções, as fotos e a ordem que vocês escolheram continuam guardados, e publicar de novo traz o site inteiro de volta, do jeito que estava."
              : "Não apagamos nada. O texto, as seções e a ordem que vocês escolheram continuam guardados, e publicar de novo traz o site inteiro de volta, do jeito que estava."}
          </Typography>

          {/**
           * **A METADE DESCONFORTÁVEL, E ELA SÓ EXISTE PORQUE EXISTE FOTO**
           * (RV-21, prd-v1 §4.8.4).
           *
           * A foto mora em `pub/`, servido por um domínio público sem sessão.
           * Tirar o site do ar faz `/e/<slug>` responder 404 e **não** faz a foto
           * parar de responder — quem já abriu o site, ou recebeu o endereço da
           * foto num encaminhamento, continua vendo.
           *
           * O `po` escolheu dizer isso em vez de mover objeto a objeto ao
           * despublicar, e a escolha só é honesta se a frase **apontar a saída
           * completa**: apagar a foto, que apaga o arquivo no balde na hora. Uma
           * frase que só avise, sem dizer o que fazer, transforma uma decisão de
           * arquitetura num susto.
           */}
          {dados.temFoto ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              A página para de responder, mas quem já abriu o site e guardou o
              endereço de uma foto continua conseguindo abrir essa foto. Para
              tirar uma foto do ar de vez, apague a foto.
            </Typography>
          ) : null}
        </Stack>
      </FolhaOuDialogo>
    </>
  );
}

export default PublicacaoDoSite;
