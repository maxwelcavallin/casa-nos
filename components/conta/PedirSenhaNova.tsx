"use client";

import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { CascaDaConta } from "@/components/conta/CascaDaConta";
import { useEnvioDeConta } from "@/components/conta/usar-envio-de-conta";
import { toque } from "@/lib/tokens";

/**
 * "ESQUECI A SENHA" — o pedido do link.
 *
 * **A TELA DE SUCESSO NÃO CONFIRMA QUE O E-MAIL EXISTE**, e a frase foi escrita
 * para isso: *"se existir uma conta com esse e-mail, o link está a caminho"*. É a
 * mesma regra da rota, e ela só funciona se as duas metades disserem a mesma
 * coisa — uma tela que dissesse "mandamos para você" desmentiria o servidor e
 * transformaria esta página num verificador de endereços.
 *
 * **O ESTADO DE SUCESSO SUBSTITUI O FORMULÁRIO.** Deixar o campo na tela depois
 * do envio convida a mandar de novo, e o segundo pedido invalida o primeiro link
 * — que é o que a pessoa acabou de receber.
 */
export function PedirSenhaNova() {
  const [email, setEmail] = useState("");
  const [pedido, setPedido] = useState(false);
  const envio = useEnvioDeConta();

  async function pedir(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = await envio.enviar("/api/sessao/recuperacao", { email });
    if (resultado.ok) setPedido(true);
  }

  if (pedido) {
    return (
      <CascaDaConta
        titulo="Confira o e-mail"
        explicacao="Se existir uma conta com esse endereço, o link para escolher uma senha nova está a caminho. Ele vale uma hora e serve uma vez só."
        rodape={<Link href="/entrar">Voltar para entrar</Link>}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Não chegou em alguns minutos? Confira o lixo eletrônico — e confira
          também se o endereço é o mesmo que vocês usaram para criar o site.
        </Typography>
      </CascaDaConta>
    );
  }

  return (
    <CascaDaConta
      titulo="Esqueceram a senha?"
      explicacao="A gente manda um link para escolher outra."
      erroGeral={envio.erroGeral}
      rodape={<Link href="/entrar">Voltar para entrar</Link>}
    >
      <Stack component="form" onSubmit={pedir} sx={{ gap: 2.5 }}>
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
        <Button
          type="submit"
          variant="contained"
          disabled={envio.enviando}
          sx={{ alignSelf: "flex-start", minHeight: toque.confortavel }}
        >
          {envio.enviando ? "Mandando…" : "Mandar o link"}
        </Button>
      </Stack>
    </CascaDaConta>
  );
}

export default PedirSenhaNova;
