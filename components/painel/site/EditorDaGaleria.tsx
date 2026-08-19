"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";

import { EstadoVazio } from "@/components/EstadoVazio";
import { gerarDerivadas } from "@/lib/fila/derivadas";
import {
  conferirArquivo,
  conferirLadoMenor,
  MAXIMO_DE_FOTOS,
  RECUSA_DE_FORMATO_EXOTICO,
} from "@/lib/galeria";
import { grade, raio, toque } from "@/lib/tokens";

/**
 * O EDITOR DA GALERIA (v1.0, V-18) — o laço de envio, e a falha parcial.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O CAMINHO INTEIRO DE UMA FOTO, e por que ele é assim:
 *
 *   1. `conferirArquivo`     25 MB e formato, **antes de decodificar**
 *   2. `gerarDerivadas`      duas derivadas NO NAVEGADOR — os 12 MB do iPhone
 *                            nunca cruzam a rede
 *   3. `conferirLadoMenor`   sobre as medidas do arquivo escolhido, não da prévia
 *   4. `POST .../galeria`    a intenção: a LINHA nasce, e volta com duas URLs
 *   5. dois `PUT` no R2      direto do navegador para o balde
 *   6. `POST .../confirmacao` o carimbo. Antes dele a foto não existe para o site
 *
 * **A PARTE DIFÍCIL É O PASSO 5 FALHAR PELA METADE**, e é o custo real desta
 * história: a miniatura sobe e a prévia não. O álbum resolve essa mesma falha
 * com a fila inteira — motor, armazém em IndexedDB, recuo exponencial sem limite
 * de tentativas, de-duplicação por hash. **Aquela máquina existe para 200
 * convidados num uplink de salão saturado durante seis horas**, e não para uma
 * pessoa com o painel aberto em casa. Usá-la aqui seria construir o caro para
 * resolver o barato.
 *
 * O que a galeria tem no lugar são duas coisas, e elas bastam **porque o
 * original está no celular do casal**:
 *
 *   a. **Nada é carimbado até os dois `PUT` terem terminado.** Um envio que
 *      morre no meio deixa a linha como intenção — e linha sem `armazenada_em`
 *      não renderiza no site e não conta (RV-25). O site nunca mostra meia foto.
 *
 *   b. **Tentar de novo reusa a MESMA linha.** O `foto_id` e as duas URLs ficam
 *      guardados no estado desta tela; a retentativa pula a intenção e refaz os
 *      `PUT` (as URLs valem 24 h). **Nenhuma linha nova é criada**, e é por isso
 *      que insistir cinco vezes não produz cinco fotos fantasmas.
 *
 * **E SE A PESSOA FECHAR A ABA NO MEIO:** a linha de intenção fica no banco,
 * invisível em todo lugar, e a foto simplesmente não foi. Ela manda de novo, e
 * essa é a operação inteira. Não há cron de limpeza, e a 0015 escreve por quê —
 * é lixo na tabela, não no balde, e com teto de doze por evento isso não é
 * problema. Escrever a ausência é mais barato que construir o faxineiro.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TODA MENSAGEM DE RECUSA É ESPECÍFICA, e **nenhuma usa a palavra "erro"**. O
 * HEIC exótico é o caso real documentado: o álbum guarda o original e manda o
 * servidor gerar a prévia depois; a galeria não tem original no balde, então ela
 * responde a verdade na hora, com a saída na mão da pessoa.
 */

/** A foto que já está no site. Vem do servidor, montada na página. */
export type FotoNoEditor = {
  id: string;
  /** A MINIATURA de 400 (D7). A prévia de 1600 é do site. `null` sem R2. */
  urlMiniatura: string | null;
  legenda: string | null;
  /** `false` = medidas incoerentes: a foto está guardada e **não aparece**. */
  apareceNoSite: boolean;
};

export type DadosDaGaleria = {
  eventoId: string;
  fotos: FotoNoEditor[];
  /**
   * `false` quando `R2_PUBLIC_BASE` ou as credenciais do balde não estão
   * configuradas. A tela diz que o envio está indisponível **antes** de a pessoa
   * escolher um arquivo — deixá-la escolher a foto para receber 503 depois é
   * gastar o tempo dela para dar a mesma resposta.
   */
  envioDisponivel: boolean;
};

type Passo = "preparando" | "enviando" | "confirmando" | "pronta" | "parou";

type Envio = {
  /** Id local. Não é o `foto_id`: ele só existe depois da intenção. */
  chave: string;
  nome: string;
  arquivo: File;
  /** O endereço local da prévia, para a pessoa ver o que escolheu. */
  previaLocal: string;
  /** Existe depois da intenção. **É o que faz tentar de novo reusar a linha.** */
  fotoId: string | null;
  urls: { miniatura: string; previa: string } | null;
  medidas: { largura: number; altura: number; bytesPrevia: number } | null;
  derivadas: { miniatura: Blob; previa: Blob } | null;
  passo: Passo;
  /** O motivo, específico. Nunca "erro". */
  motivo: string | null;
};

const ROTULO_DO_PASSO: Record<Passo, string> = {
  preparando: "Preparando a foto…",
  enviando: "Enviando…",
  confirmando: "Quase lá…",
  pronta: "No site",
  parou: "Não terminou",
};

export function EditorDaGaleria({ dados }: { dados: DadosDaGaleria }) {
  const [fotos] = useState(dados.fotos);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const entrada = useRef<HTMLInputElement>(null);

  const prontas = fotos.length + envios.filter(e => e.passo === "pronta").length;

  function atualizar(chave: string, mudanca: Partial<Envio>) {
    setEnvios(atual => atual.map(e => (e.chave === chave ? { ...e, ...mudanca } : e)));
  }

  function parar(chave: string, motivo: string) {
    atualizar(chave, { passo: "parou", motivo });
  }

  /**
   * O laço de um envio. Recebe o estado atual porque ele muda entre passos, e
   * ler do `useState` aqui dentro pegaria a versão de antes da intenção — a
   * retentativa perderia o `foto_id` e criaria uma linha nova a cada toque.
   */
  async function levar(envio: Envio) {
    const { chave } = envio;

    // ─── 1 e 2: preparar, no navegador ───
    let medidas = envio.medidas;
    let derivadas = envio.derivadas;

    if (!derivadas || !medidas) {
      atualizar(chave, { passo: "preparando", motivo: null });

      const recusaDoArquivo = conferirArquivo(envio.arquivo);
      if (recusaDoArquivo) return parar(chave, recusaDoArquivo.mensagem);

      const geradas = await gerarDerivadas(envio.arquivo);
      // `null` NÃO É FALHA DO PRODUTO: é um formato que o navegador não abre.
      // Sem original no balde, não há servidor para resgatar — então a resposta
      // é a verdade, na hora, com o caminho de saída.
      if (!geradas) return parar(chave, RECUSA_DE_FORMATO_EXOTICO);

      const recusaDeTamanho = conferirLadoMenor(
        geradas.larguraOriginal,
        geradas.alturaOriginal
      );
      if (recusaDeTamanho) return parar(chave, recusaDeTamanho.mensagem);

      medidas = {
        largura: geradas.largura,
        altura: geradas.altura,
        bytesPrevia: geradas.previa.size,
      };
      derivadas = { miniatura: geradas.miniatura, previa: geradas.previa };
      atualizar(chave, { medidas, derivadas });
    }

    // ─── 3: a intenção, só se ainda não houver linha ───
    let fotoId = envio.fotoId;
    let urls = envio.urls;

    if (!fotoId || !urls) {
      atualizar(chave, { passo: "enviando" });
      try {
        const resposta = await fetch(`/api/eventos/${dados.eventoId}/site/galeria`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            largura: medidas.largura,
            altura: medidas.altura,
            bytes_previa: medidas.bytesPrevia,
          }),
        });
        if (resposta.status === 503) {
          return parar(
            chave,
            "O envio de fotos está indisponível agora. Nenhuma foto foi perdida: " +
              "tente de novo daqui a pouco, ou avise quem cuida do site."
          );
        }
        if (!resposta.ok) {
          return parar(
            chave,
            "Não conseguimos começar o envio agora. Nada foi para o site — toque em tentar de novo."
          );
        }
        const corpo = (await resposta.json()) as {
          foto_id: string;
          urls: { miniatura: string; previa: string };
        };
        fotoId = corpo.foto_id;
        urls = corpo.urls;
        atualizar(chave, { fotoId, urls });
      } catch {
        return parar(
          chave,
          "A internet caiu antes de o envio começar. Nada foi para o site — toque em tentar de novo."
        );
      }
    }

    // ─── 4: os dois PUT, direto no balde ───
    atualizar(chave, { passo: "enviando", motivo: null });
    try {
      const subir = (url: string, corpo: Blob) =>
        fetch(url, { method: "PUT", body: corpo }).then(r => {
          if (!r.ok) throw new Error(String(r.status));
        });

      /**
       * **EM SEQUÊNCIA, E NÃO EM PARALELO.** Duas requisições simultâneas no 4G
       * do celular disputam o mesmo uplink e as duas ficam lentas; e, mais
       * importante, o `Promise.all` esconde qual das duas falhou. Aqui, se a
       * prévia parar, a miniatura já subiu — e a retentativa reenvia as duas,
       * que é o certo: `PUT` sobrescreve, e reenviar um objeto idêntico não
       * custa nada além do byte.
       */
      await subir(urls.miniatura, derivadas.miniatura);
      await subir(urls.previa, derivadas.previa);
    } catch {
      return parar(
        chave,
        "A foto parou no meio do caminho. Ela ainda não está no site — toque em tentar de novo."
      );
    }

    // ─── 5: o carimbo. É ele que faz a foto existir para o site. ───
    atualizar(chave, { passo: "confirmando" });
    try {
      const resposta = await fetch(
        `/api/eventos/${dados.eventoId}/site/galeria/${fotoId}/confirmacao`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            largura: medidas.largura,
            altura: medidas.altura,
            bytes_previa: medidas.bytesPrevia,
          }),
        }
      );
      if (!resposta.ok) throw new Error(String(resposta.status));
    } catch {
      /**
       * **O SEGUNDO `POST` FALHOU, E ESTE É O ESTADO QUE O `po` ISOLOU.**
       *
       * Os dois arquivos estão no balde e o banco ainda diz "intenção". O texto
       * não pode dizer "a foto foi": ela não aparece no site. E não pode dizer
       * "a foto se perdeu": ela está lá, e tentar de novo termina o trabalho sem
       * subir nada de novo que importe.
       */
      return parar(
        chave,
        "A foto subiu, mas não conseguimos confirmar. Ela ainda não aparece no site — " +
          "toque em tentar de novo, que a gente termina daqui."
      );
    }

    atualizar(chave, { passo: "pronta", motivo: null });
  }

  function escolher(lista: FileList | null) {
    if (!lista || lista.length === 0) return;

    const novos: Envio[] = [...lista].map((arquivo, i) => ({
      chave: `${Date.now()}-${i}-${arquivo.name}`,
      nome: arquivo.name,
      arquivo,
      previaLocal: URL.createObjectURL(arquivo),
      fotoId: null,
      urls: null,
      medidas: null,
      derivadas: null,
      passo: "preparando" as const,
      motivo: null,
    }));

    setEnvios(atual => [...atual, ...novos]);
    // Um de cada vez, na ordem em que a pessoa escolheu: a ordem no site é a
    // ordem de chegada, e disparar tudo junto embaralharia as duas.
    void novos.reduce(
      (antes, envio) => antes.then(() => levar(envio)),
      Promise.resolve()
    );

    // O `<input type="file">` guarda o último valor. Sem isto, escolher a MESMA
    // foto duas vezes seguidas não dispara nada — e a pessoa acha que travou.
    if (entrada.current) entrada.current.value = "";
  }

  function tentarDeNovo(chave: string) {
    const envio = envios.find(e => e.chave === chave);
    if (!envio) return;
    void levar(envio);
  }

  const nada = fotos.length === 0 && envios.length === 0;

  return (
    <Stack sx={{ gap: 2 }}>
      {!dados.envioDisponivel ? (
        <Alert severity="warning">
          O envio de fotos está indisponível neste momento. O resto do site
          continua funcionando normalmente, e nada do que já está no ar mudou.
        </Alert>
      ) : null}

      {nada ? (
        <EstadoVazio
          titulo="Nenhuma foto ainda"
          corpo="Enquanto estiver vazia, a seção não aparece no site. Escolha uma foto de vocês — ela aparece grande, uma embaixo da outra."
          acao={
            <Button
              variant="contained"
              startIcon={<ImagePlus size={18} />}
              onClick={() => entrada.current?.click()}
              disabled={!dados.envioDisponivel}
              sx={{ minHeight: toque.confortavel }}
            >
              Escolher a primeira foto
            </Button>
          }
        />
      ) : null}

      {!nada ? (
        <Card>
          <Stack divider={<Divider />}>
            {fotos.map(item => (
              <LinhaDaFoto
                key={item.id}
                url={item.urlMiniatura}
                titulo={item.legenda ?? "Foto de vocês"}
                estado={item.apareceNoSite ? "No site" : "Guardada, mas fora do site"}
                aviso={
                  item.apareceNoSite
                    ? null
                    : "As medidas desta foto não batem, e por isso o site não consegue reservar o espaço dela. Mande a foto de novo."
                }
              />
            ))}

            {envios.map(envio => (
              <LinhaDaFoto
                key={envio.chave}
                url={envio.previaLocal}
                titulo={envio.nome}
                estado={ROTULO_DO_PASSO[envio.passo]}
                trabalhando={envio.passo !== "pronta" && envio.passo !== "parou"}
                aviso={envio.motivo}
                acao={
                  envio.passo === "parou" ? (
                    <Button
                      onClick={() => tentarDeNovo(envio.chave)}
                      sx={{ minHeight: toque.minimo }}
                    >
                      Tentar de novo
                    </Button>
                  ) : null
                }
              />
            ))}
          </Stack>
        </Card>
      ) : null}

      {/**
       * `hidden` no atributo, e não `display: none` no `sx`: o campo continua
       * acessível pelo botão, que é quem tem rótulo e alvo de 48 px. Um
       * `<input type="file">` cru é um dos controles mais difíceis de acertar no
       * celular, e ele não precisa aparecer para funcionar.
       */}
      <Box
        component="input"
        type="file"
        ref={entrada}
        hidden
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => escolher(e.target.files)}
      />

      {!nada ? (
        <Stack sx={{ gap: 0.5, alignItems: "flex-start" }}>
          <Button
            variant="contained"
            startIcon={<ImagePlus size={18} />}
            onClick={() => entrada.current?.click()}
            disabled={!dados.envioDisponivel}
            sx={{ minHeight: toque.confortavel }}
          >
            Escolher outra foto
          </Button>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {prontas === 1
              ? `Uma foto no site. Cabem ${MAXIMO_DE_FOTOS}.`
              : `${prontas} fotos no site. Cabem ${MAXIMO_DE_FOTOS}.`}
          </Typography>
        </Stack>
      ) : null}
    </Stack>
  );
}

/**
 * Uma linha da lista do editor.
 *
 * **A MINIATURA AQUI PODE SER RECORTADA EM 1:1**, e isso não contradiz a regra
 * do site: lá a foto renderizada é a única que existe e o recorte é permanente
 * (§20.3); aqui ela é um reconhecedor de 72 px ao lado do nome do arquivo, e a
 * foto de verdade está a um toque no site. É a mesma régua do `CardMidia`:
 * `object-fit: cover` só onde a foto abre em outra superfície.
 */
function LinhaDaFoto({
  url,
  titulo,
  estado,
  aviso,
  acao,
  trabalhando = false,
}: {
  url: string | null;
  titulo: string;
  estado: string;
  aviso?: string | null;
  acao?: React.ReactNode;
  trabalhando?: boolean;
}) {
  return (
    <Stack
      direction="row"
      sx={{ gap: 1.5, px: 2, py: 2, alignItems: "flex-start" }}
    >
      <Box
        sx={{
          width: grade.tileMinimo,
          height: grade.tileMinimo,
          flex: "none",
          borderRadius: `${raio.input}px`,
          bgcolor: "action.selected",
          overflow: "hidden",
        }}
      >
        {url ? (
          <Box
            component="img"
            src={url}
            alt=""
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : null}
      </Box>

      <Stack sx={{ gap: 0.5, flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>
          {titulo}
        </Typography>
        <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
          {trabalhando ? <CircularProgress size={14} aria-hidden /> : null}
          {/* O estado tem RÓTULO ESCRITO, e não só um ícone girando: cor e
              movimento não são o único sinal (régua §10). */}
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {estado}
          </Typography>
        </Stack>
        {aviso ? (
          <Typography variant="body2" sx={{ color: "warning.dark", overflowWrap: "anywhere" }}>
            {aviso}
          </Typography>
        ) : null}
        {acao}
      </Stack>
    </Stack>
  );
}

export default EditorDaGaleria;
