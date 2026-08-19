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
import { MINIMO_DE_SENHA } from "@/lib/senhas";
import { toque } from "@/lib/tokens";

/**
 * A SENHA NOVA — a ponta do link que chegou por e-mail.
 *
 * **A TELA AVISA QUE OS OUTROS APARELHOS VÃO CAIR**, e isso não é detalhe de
 * implementação exposto sem motivo: trocar a senha revoga todas as sessões da
 * conta (é o que faz a troca servir a quem desconfia que alguém entrou), e sem o
 * aviso o outro celular do casal simplesmente para de funcionar sem ninguém
 * entender por quê.
 *
 * **O TOKEN NÃO É VALIDADO CONTRA O BANCO AO ABRIR A PÁGINA**, só no envio. Um
 * `GET` que consumisse o token seria disparado pelo verificador de links do
 * cliente de e-mail — a pessoa receberia "expirou" no primeiro clique, porque o
 * antivírus já teria usado o link.
 */
export function EscolherSenhaNova({ token }: { token: string | null }) {
  const roteador = useRouter();
  const [senha, setSenha] = useState("");
  const envio = useEnvioDeConta();

  async function trocar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = await envio.enviar("/api/sessao/senha", { token, senha });
    if (!resultado.ok) return;

    const corpo = resultado.corpo as { evento_id: string | null };
    // Quem trocou a senha já está dentro: a sessão nova saiu na mesma resposta.
    // Mandá-lo digitar a senha que ele acabou de escolher seria pedir a mesma
    // prova duas vezes.
    roteador.replace(corpo.evento_id ? `/painel/${corpo.evento_id}/site` : "/entrar");
  }

  if (!token) {
    return (
      <CascaDaConta
        titulo="Este link expirou"
        explicacao="Os links de senha valem uma hora e servem uma vez só."
        rodape={<Link href="/recuperar">Pedir outro link</Link>}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          A senha atual continua valendo — nada mudou.
        </Typography>
      </CascaDaConta>
    );
  }

  return (
    <CascaDaConta
      titulo="Escolher uma senha nova"
      erroGeral={envio.erroGeral}
      rodape={<Link href="/entrar">Voltar para entrar</Link>}
    >
      <Stack component="form" onSubmit={trocar} sx={{ gap: 2.5 }}>
        <TextField
          label="Senha nova"
          type="password"
          value={senha}
          onChange={e => {
            setSenha(e.target.value);
            envio.limpar();
          }}
          autoComplete="new-password"
          error={!!envio.erros.senha}
          helperText={
            envio.erros.senha ??
            `Pelo menos ${MINIMO_DE_SENHA} caracteres. Uma frase que vocês lembrem serve melhor que um código difícil.`
          }
          fullWidth
          autoFocus
        />

        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Ao trocar a senha, <strong>os aparelhos que estavam conectados saem</strong>{" "}
          — inclusive o outro celular de vocês. É o que faz a troca valer quando
          alguém mais tinha acesso.
        </Typography>

        <Button
          type="submit"
          variant="contained"
          disabled={envio.enviando}
          sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
        >
          {envio.enviando ? "Trocando…" : "Trocar a senha"}
        </Button>
      </Stack>
    </CascaDaConta>
  );
}

export default EscolherSenhaNova;
