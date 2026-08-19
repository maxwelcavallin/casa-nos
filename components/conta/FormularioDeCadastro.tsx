"use client";

import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CascaDaConta } from "@/components/conta/CascaDaConta";
import { useEnvioDeConta } from "@/components/conta/usar-envio-de-conta";
import { enviarEvento } from "@/lib/analytics";
import { MINIMO_DE_SENHA } from "@/lib/senhas";
import { TETOS_DO_EVENTO } from "@/lib/site-evento";
import { toque } from "@/lib/tokens";

/**
 * CRIAR O SITE — o cadastro público (19/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **CINCO CAMPOS, E CADA UM TEM UMA COLUNA `not null` ATRÁS DELE.** A régua não é
 * "o que seria bom saber no começo": é "sem isto a linha não nasce". Local,
 * horário, mapa, história e foto **não estão aqui** de propósito — cada campo a
 * mais numa tela de cadastro é gente que desiste, e todos eles têm uma tela
 * própria no painel, com explicação, no momento em que o casal souber a resposta.
 *
 * **A TELA DIZ QUE O SITE NASCE FORA DO AR**, e isso é a parte que não pode
 * faltar: sem essa frase, o casal preenche quatro campos achando que acabou de
 * publicar um endereço com um casamento em branco — e passa a próxima hora
 * procurando como tirar do ar.
 *
 * **A DATA VIAJA COMO TEXTO** (`AAAA-MM-DD`, do `<input type="date">`) e não
 * passa por `Date` em canto nenhum (RV-10). Em UTC, `new Date("2027-08-22")`
 * lido em São Paulo é dia 21 — e o site anunciaria o casamento um dia antes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function FormularioDeCadastro({
  /**
   * De onde veio quem se cadastrou (`metricas.md` §6.1). Nesta versão só existe
   * `direto`: o CTA do álbum, que produziria `indicacao`, está desligado por
   * dado. O parâmetro nasce declarado porque o dia em que o álbum voltar, o
   * relatório precisa distinguir os dois — e um evento que passou meses sem o
   * campo não se preenche retroativamente.
   */
  origem = "direto",
  indicadoPor = null,
}: {
  origem?: "direto" | "indicacao";
  indicadoPor?: string | null;
}) {
  const roteador = useRouter();
  const [campos, setCampos] = useState({
    nome_casal: "",
    data_evento: "",
    cidade: "",
    uf: "",
    email: "",
    senha: "",
  });
  const envio = useEnvioDeConta();

  function mudar<C extends keyof typeof campos>(campo: C, valor: string) {
    setCampos(atual => ({ ...atual, [campo]: valor }));
    envio.limpar();
  }

  async function cadastrar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = await envio.enviar("/api/sessao/cadastrar", campos);
    if (!resultado.ok) return;

    const corpo = resultado.corpo as { evento_id: string };

    /**
     * **OS DOIS EVENTOS SAEM AQUI, E SÓ AQUI** (`metricas.md` §6.1). `sign_up` é
     * a conta; `wedding_created` é o casamento. Nesta versão eles acontecem no
     * mesmo instante porque um cadastro cria os dois — e continuam sendo dois
     * eventos porque a árvore de métricas os separa: aquisição e ativação
     * respondem perguntas diferentes, e o dia em que existir conta sem casamento
     * (ou casamento sem cadastro) o relatório já saberá contar os dois.
     *
     * Eles saem **depois** de o servidor confirmar. Emitir no toque contaria
     * cadastro que não aconteceu, e o GA4 não desconta.
     */
    enviarEvento("sign_up", {
      wedding_id: corpo.evento_id,
      signup_source: indicadoPor ? "indicacao" : origem,
      referring_wedding_id: indicadoPor ?? "",
    });
    enviarEvento("wedding_created", { wedding_id: corpo.evento_id });

    roteador.replace(`/painel/${corpo.evento_id}/site`);
  }

  return (
    <CascaDaConta
      titulo="Criar o site de vocês"
      explicacao="Quatro respostas agora, e o resto vocês escrevem depois, com calma."
      erroGeral={envio.erroGeral}
      rodape={
        <Typography variant="body2">
          Já tem conta? <Link href="/entrar">Entrar</Link>
        </Typography>
      }
    >
      <Stack component="form" onSubmit={cadastrar} sx={{ gap: 2.5 }}>
        <TextField
          label="Como vocês aparecem no site"
          value={campos.nome_casal}
          onChange={e => mudar("nome_casal", e.target.value)}
          error={!!envio.erros.nome_casal}
          helperText={envio.erros.nome_casal ?? "Ex.: Ana Flávia e Maxwel"}
          slotProps={{ htmlInput: { maxLength: TETOS_DO_EVENTO.nomeCasal } }}
          fullWidth
          autoFocus
        />

        <TextField
          label="Data do casamento"
          type="date"
          value={campos.data_evento}
          onChange={e => mudar("data_evento", e.target.value)}
          error={!!envio.erros.data_evento}
          helperText={envio.erros.data_evento ?? "Dá para mudar depois, se ainda não fechou."}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />

        <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
          <TextField
            label="Cidade"
            value={campos.cidade}
            onChange={e => mudar("cidade", e.target.value)}
            error={!!envio.erros.cidade}
            helperText={envio.erros.cidade}
            slotProps={{ htmlInput: { maxLength: TETOS_DO_EVENTO.cidade } }}
            fullWidth
          />
          <TextField
            label="Estado"
            value={campos.uf}
            onChange={e => mudar("uf", e.target.value.toUpperCase())}
            error={!!envio.erros.uf}
            helperText={envio.erros.uf ?? "Duas letras"}
            slotProps={{ htmlInput: { maxLength: TETOS_DO_EVENTO.uf } }}
            sx={{ maxWidth: { sm: 140 } }}
            fullWidth
          />
        </Stack>

        <TextField
          label="E-mail"
          type="email"
          value={campos.email}
          onChange={e => mudar("email", e.target.value)}
          autoComplete="email"
          error={!!envio.erros.email}
          helperText={envio.erros.email ?? "É por ele que vocês entram, e que a senha se recupera."}
          fullWidth
        />

        <TextField
          label="Senha"
          type="password"
          value={campos.senha}
          onChange={e => mudar("senha", e.target.value)}
          autoComplete="new-password"
          error={!!envio.erros.senha}
          helperText={
            envio.erros.senha ??
            `Pelo menos ${MINIMO_DE_SENHA} caracteres. Uma frase que vocês lembrem serve melhor que um código difícil.`
          }
          fullWidth
        />

        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          O site nasce <strong>fora do ar</strong>: ninguém consegue abrir até vocês
          publicarem, e publicar é um toque no painel.
        </Typography>

        <Button
          type="submit"
          variant="contained"
          disabled={envio.enviando}
          sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
        >
          {envio.enviando ? "Criando…" : "Criar o site"}
        </Button>
      </Stack>
    </CascaDaConta>
  );
}

export default FormularioDeCadastro;
