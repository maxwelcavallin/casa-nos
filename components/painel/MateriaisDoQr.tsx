"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { ChamadaQr, type DensidadeDaChamada } from "@/components/marca/ChamadaQr";
import { FaixaVisaoDono } from "@/components/painel/FaixaVisaoDono";
import { PalcoTelao } from "@/components/telao/PalcoTelao";
import { enviarEvento } from "@/lib/analytics";
import { largura, raio, toque } from "@/lib/tokens";

/**
 * O MATERIAL DO QR (H-04) — *"a única coisa que precisa existir em papel no
 * dia"*.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE É O PASSO 1 DO FUNIL INTEIRO, E O GARGALO REAL. Se o código não for
 * impresso, a participação será zero por um motivo que não é do produto — e
 * `qr_material_downloaded` é o único evento desta fatia cuja ausência invalida a
 * leitura de todos os outros.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TRÊS DENSIDADES, E A DIFERENÇA É DE PROPÓSITO (§16.9):
 *
 *   `mesa`   QR + nome + endereço por extenso. **Nada mais** — quem está na mesa
 *            tem o celular na mão e três segundos, e cada linha a mais compete
 *            com a instrução.
 *   `cartaz` ganha uma frase, porque quem lê um cartaz está parado na frente
 *            dele.
 *   `telao`  a chamada inteira: é um cartaz de 3 m visto de longe.
 *
 * A frase extra **não existe** na densidade `mesa`, e isso é regra do componente
 * (`ChamadaQr` ignora a prop), não escolha de quem monta esta tela.
 *
 * O ERRO É **POR CARTÃO**: se o cartaz falha e o cartão de mesa gera, dois
 * cartões continuam com o botão vivo. Nunca um alerta no topo desabilitando os
 * três.
 */

export type DadosDosMateriais = {
  eventoId: string;
  nomeCasal: string;
  /** O endereço escrito, legível a 30 cm. É a única retentativa do passo 1. */
  endereco: string;
  /** Quando a janela abre — a linha de apoio fala dela. */
  abreEm: string;
  /** `https://host`, para montar o link do telão inteiro quando ele nascer. */
  origem: string;
  /** Os links de telão vivos. O token não está aqui: ele existe uma vez só. */
  teloes: Array<{ id: string }>;
  /**
   * `false` para o moderador: ele vê os materiais (`evento.materiais.ver`) e
   * **não** configura o evento. Criar e revogar link é `dia.configurar`, que
   * é só do casal — a rota já recusa, e a tela não oferece o que a rota nega.
   */
  podeConfigurar: boolean;
  ehDono: boolean;
};

type Material = {
  chave: "mesa" | "cartaz" | "telao";
  densidade: DensidadeDaChamada;
  titulo: string;
  apoio: string;
};

const MATERIAIS: Material[] = [
  {
    chave: "mesa",
    densidade: "mesa",
    titulo: "Cartão de mesa",
    apoio: "Um em cada mesa. É de onde vem quase toda foto.",
  },
  {
    chave: "cartaz",
    densidade: "cartaz",
    titulo: "Cartaz",
    apoio: "Para a entrada e para o corredor do banheiro.",
  },
  {
    chave: "telao",
    densidade: "telao",
    titulo: "Arte do telão",
    apoio: "A mesma tela que o projetor mostra antes da primeira foto chegar.",
  },
];

/** A frase extra do cartaz. 35 caracteres, e ela só existe ali. */
const FRASE_DO_CARTAZ = "O fotógrafo não estava na sua mesa.";

export function MateriaisDoQr({ dados }: { dados: DadosDosMateriais }) {
  const [falhou, setFalhou] = useState<Record<string, boolean>>({});
  const [teloes, setTeloes] = useState(dados.teloes);
  const [linkNovo, setLinkNovo] = useState<string | null>(null);
  const [erroDoTelao, setErroDoTelao] = useState<string | null>(null);
  const [aCancelar, setACancelar] = useState<string | null>(null);

  /**
   * O LINK DO TELÃO NASCE AQUI, e não na tela do dia — **é aqui que o QR e os
   * links vivem juntos**.
   *
   * A H-02 pede "revogar o link do telão" na tela do dia e o `gtm.md` dá o texto
   * do diálogo, mas **nenhum dos dois diz onde ele é CRIADO**. Ficou registrado
   * como buraco na F1.1 e é fechado agora, na F1.4, porque sem ele a H-12 não
   * tem porta: o telão abre por link próprio, e se ninguém consegue gerar o
   * link, a tela mais visível do produto é inalcançável.
   *
   * **O TOKEN EXISTE UMA VEZ SÓ**, no instante em que é criado (`lib/acessos.ts`
   * guarda só o hash). Por isso a tela mostra o link inteiro logo depois de
   * gerar e nunca mais: depois disso ela lista que existe um, e oferece cancelar
   * e gerar outro. Isso é a funcionalidade, não uma limitação.
   */
  async function gerarLinkDoTelao() {
    setErroDoTelao(null);
    try {
      const resposta = await fetch(`/api/eventos/${dados.eventoId}/acessos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "telao" }),
      });
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as {
        acesso: { id: string };
        token: string | null;
      };
      setTeloes(atual => [...atual, { id: corpo.acesso.id }]);
      if (corpo.token) setLinkNovo(`${dados.origem}/telao/${corpo.token}`);
    } catch {
      setErroDoTelao("Não conseguimos gerar o link agora. Tente de novo em instantes.");
    }
  }

  async function cancelarLinkDoTelao(acessoId: string) {
    setACancelar(null);
    setErroDoTelao(null);
    const antes = teloes;
    setTeloes(atual => atual.filter(t => t.id !== acessoId));
    setLinkNovo(null);
    try {
      const resposta = await fetch(
        `/api/eventos/${dados.eventoId}/acessos/${acessoId}`,
        { method: "DELETE" }
      );
      if (!resposta.ok) throw new Error(String(resposta.status));
    } catch {
      setTeloes(antes);
      setErroDoTelao("Não conseguimos cancelar agora. O link continua valendo.");
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Área de transferência bloqueada. O link continua **escrito na tela**,
      // que é o que resolve o problema — o botão era o atalho, não a solução.
    }
  }

  function urlDoQr(origem: string) {
    return `/api/eventos/${dados.eventoId}/qr?o=${origem}&formato=svg`;
  }

  async function baixar(material: Material) {
    try {
      const resposta = await fetch(urlDoQr(material.chave));
      if (!resposta.ok) throw new Error(String(resposta.status));
      const svg = await resposta.text();

      /**
       * O download é feito a partir do texto já em mãos, e não por um `<a>`
       * apontando para a rota: assim uma falha de geração vira o estado de erro
       * **deste cartão**, com o endereço por extenso ao lado — em vez de uma aba
       * em branco ou um arquivo de zero byte na pasta de Downloads.
       */
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const ancora = document.createElement("a");
      ancora.href = url;
      ancora.download = `qr-${material.chave}.svg`;
      ancora.click();
      URL.revokeObjectURL(url);

      setFalhou(anterior => ({ ...anterior, [material.chave]: false }));
      enviarEvento("qr_material_downloaded", {
        wedding_id: dados.eventoId,
        material_kind: material.chave,
      });
    } catch {
      setFalhou(anterior => ({ ...anterior, [material.chave]: true }));
    }
  }

  async function copiarEndereco() {
    try {
      await navigator.clipboard.writeText(dados.endereco);
    } catch {
      // Área de transferência bloqueada. O endereço continua **escrito na tela**,
      // que é o que resolve o problema — o botão era o atalho, não a solução.
    }
  }

  return (
    <Box component="main" sx={{ minHeight: "100dvh" }}>
      {dados.ehDono ? <FaixaVisaoDono /> : null}

      <Box sx={{ maxWidth: largura.app, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        <Stack sx={{ gap: 3 }}>
          <Stack sx={{ gap: 1 }}>
            <Typography variant="h3" component="h1">
              O código para imprimir
            </Typography>
            <Typography variant="body1">
              Três formatos prontos. É a única coisa que precisa existir em papel no dia.
            </Typography>
          </Stack>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
              gap: 3,
            }}
          >
            {MATERIAIS.map(material => (
              <Card key={material.chave}>
                <Stack sx={{ gap: 2, p: 2 }}>
                  {material.densidade === "telao" ? (
                    // A prévia da arte do telão É o telão, montado pelo mesmo
                    // componente — uma fonte, dois destinos. O que o casal baixa
                    // e o que o projetor mostra não podem divergir.
                    <Box sx={{ borderRadius: `${raio.input}px`, overflow: "hidden" }}>
                      <PalcoTelao comoPrevia>
                        <ChamadaQr
                          densidade="telao"
                          nomeCasal={dados.nomeCasal}
                          endereco={dados.endereco}
                          urlDoQr={urlDoQr("telao")}
                        />
                      </PalcoTelao>
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        bgcolor: "background.default",
                        borderRadius: `${raio.input}px`,
                        p: 2,
                      }}
                    >
                      <ChamadaQr
                        densidade={material.densidade}
                        nomeCasal={dados.nomeCasal}
                        endereco={dados.endereco}
                        urlDoQr={urlDoQr(material.chave)}
                        frase={FRASE_DO_CARTAZ}
                      />
                    </Box>
                  )}

                  <Typography variant="h5" component="h2">
                    {material.titulo}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {material.apoio}
                  </Typography>

                  {falhou[material.chave] ? (
                    /**
                     * **ESTE É O MELHOR ERRO DO PRODUTO, E O PADRÃO VALE COPIAR:**
                     * ele não pede para tentar de novo. Ele entrega, ali mesmo, a
                     * coisa que o arquivo continha — o endereço — de um jeito que
                     * sobrevive a um papel escrito à mão. O casal sai da tela com
                     * o problema resolvido, e não com uma instrução.
                     */
                    <Stack sx={{ gap: 1 }}>
                      <Box
                        sx={{
                          bgcolor: "error.light",
                          color: "text.primary",
                          borderRadius: `${raio.input}px`,
                          p: 1.5,
                        }}
                      >
                        <Typography variant="body2">
                          Não conseguimos gerar o arquivo agora. O endereço abaixo funciona
                          sem ele:
                        </Typography>
                      </Box>
                      <Typography variant="h5" component="p">
                        {dados.endereco}
                      </Typography>
                      <Button
                        variant="outlined"
                        onClick={() => void copiarEndereco()}
                        sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
                      >
                        Copiar o endereço
                      </Button>
                    </Stack>
                  ) : (
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={() => void baixar(material)}
                      sx={{ minHeight: toque.confortavel }}
                    >
                      Baixar
                    </Button>
                  )}
                </Stack>
              </Card>
            ))}
          </Box>

          {/**
           * A LINHA QUE FALTAVA, e ela existe porque o casal **vai** testar o QR
           * semanas antes: sem ela, o teste devolve uma tela que parece defeito.
           * É a mesma lacuna do álbum, dita para quem tem o painel na mão.
           */}
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Pode testar agora: quem ler o código antes de {dados.abreEm} vê a data em que os
            envios abrem.
          </Typography>

          {dados.podeConfigurar ? (
            <Card>
              <Stack sx={{ gap: 2, p: 2 }}>
                <Stack sx={{ gap: 0.5 }}>
                  <Typography variant="h5" component="h2">
                    Link do telão
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Abra este link no computador ligado ao projetor. Ele só mostra fotos, não
                    mexe em nada.
                  </Typography>
                </Stack>

                {linkNovo ? (
                  <Stack sx={{ gap: 1 }}>
                    {/* O link inteiro aparece UMA vez. Depois disso só existe o
                        hash — e a tela diz isso, para ninguém procurar depois. */}
                    <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                      {linkNovo}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Guarde agora: este endereço não aparece de novo. Se perder, cancele e
                      gere outro.
                    </Typography>
                    <Button
                      variant="contained"
                      onClick={() => void copiar(linkNovo)}
                      sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
                    >
                      Copiar o link
                    </Button>
                  </Stack>
                ) : null}

                {erroDoTelao ? (
                  <Typography variant="body2" sx={{ color: "error.main" }}>
                    {erroDoTelao}
                  </Typography>
                ) : null}

                <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                  <Button
                    variant="outlined"
                    onClick={() => void gerarLinkDoTelao()}
                    sx={{ minHeight: toque.confortavel }}
                  >
                    {teloes.length === 0 ? "Gerar o link" : "Gerar outro link"}
                  </Button>
                  {teloes.map(telao => (
                    <Button
                      key={telao.id}
                      variant="text"
                      onClick={() => setACancelar(telao.id)}
                      sx={{ minHeight: toque.confortavel }}
                    >
                      Cancelar este link
                    </Button>
                  ))}
                </Stack>
              </Stack>
            </Card>
          ) : null}
        </Stack>
      </Box>

      {/* A pergunta diz a CONSEQUÊNCIA, e ela é o que o casal precisa saber
          antes de decidir: a tela do salão para de receber fotos novas. */}
      <Dialog open={aCancelar !== null} onClose={() => setACancelar(null)}>
        <DialogTitle>Cancelar este link?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            A tela do salão para de receber fotos novas. Você pode gerar outro.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => aCancelar && void cancelarLinkDoTelao(aCancelar)}
          >
            Cancelar o link
          </Button>
          <Button variant="text" onClick={() => setACancelar(null)}>
            Manter
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default MateriaisDoQr;
