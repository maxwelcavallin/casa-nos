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
import { toque } from "@/lib/tokens";

/**
 * ENTRAR — e-mail e senha.
 *
 * **O CAMPO DE SENHA NÃO TEM "MOSTRAR SENHA" NESTA VERSÃO**, e a ausência é
 * decisão: o botão resolve o erro de digitação no celular, e custa a senha
 * aparecendo em pé numa tela que muita gente abre num ônibus. A saída que este
 * produto oferece para quem errou é a mesma que resolve o esquecimento — pedir
 * uma senha nova —, e ela está a um toque daqui.
 *
 * `autoComplete` declarado nos dois campos: sem ele o gerenciador de senhas do
 * navegador não preenche nem oferece salvar, e a pessoa acaba escolhendo uma
 * senha fraca porque vai ter que lembrar dela.
 */
export function FormularioDeEntrada() {
  const roteador = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const envio = useEnvioDeConta();

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = await envio.enviar("/api/sessao/entrar", { email, senha });
    if (!resultado.ok) return;

    const corpo = resultado.corpo as { evento_id: string };
    /**
     * `replace` e não `push`: quem entrou não deve voltar para a tela de senha
     * apertando "voltar" no navegador — e, com a sessão já gravada, aquela tela
     * não teria nada a fazer além de mandá-lo para frente de novo.
     */
    roteador.replace(`/painel/${corpo.evento_id}/site`);
  }

  return (
    <CascaDaConta
      titulo="Entrar"
      explicacao="O painel do site de vocês."
      erroGeral={envio.erroGeral}
      rodape={
        <Stack sx={{ gap: 1, alignItems: "flex-start" }}>
          <Link href="/recuperar">Esqueci a senha</Link>
          <Typography variant="body2">
            Ainda não tem conta? <Link href="/cadastrar">Criar o site de vocês</Link>
          </Typography>
        </Stack>
      }
    >
      <Stack component="form" onSubmit={entrar} sx={{ gap: 2.5 }}>
        <TextField
          label="E-mail"
          type="email"
          value={email}
          onChange={e => {
            setEmail(e.target.value);
            envio.limpar();
          }}
          autoComplete="email"
          error={!!envio.erros.email}
          helperText={envio.erros.email}
          fullWidth
          autoFocus
        />
        <TextField
          label="Senha"
          type="password"
          value={senha}
          onChange={e => {
            setSenha(e.target.value);
            envio.limpar();
          }}
          autoComplete="current-password"
          error={!!envio.erros.senha}
          helperText={envio.erros.senha}
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          disabled={envio.enviando}
          sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
        >
          {envio.enviando ? "Entrando…" : "Entrar"}
        </Button>
      </Stack>
    </CascaDaConta>
  );
}

export default FormularioDeEntrada;
