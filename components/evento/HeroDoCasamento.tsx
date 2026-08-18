import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { ContagemRegressiva } from "@/components/evento/ContagemRegressiva";
import { dataPorExtenso, horaParaExibir, instanteDoEvento } from "@/lib/datas";
import type { EventoPublico } from "@/lib/eventos";

/**
 * O topo da página: quem casa, quando, e quanto falta.
 *
 * O nome do casal é o `h1` e é o único elemento gráfico — não há logotipo nem
 * monograma, porque o nome comercial do produto ainda não está decidido e uma
 * marca provisória num convite é pior que nenhuma.
 *
 * `overflowWrap: "anywhere"` porque um casal pode ter quatro nomes e 60
 * caracteres: sem isso o `h1` estoura a lateral no celular e corta letra.
 *
 * `textWrap: "balance"` reparte o texto entre as linhas em vez de encher a
 * primeira e jogar o resto para baixo. Sem ele, em 390px, o nome quebrava como
 * "Ana Flávia e / Maxwel" — a conjunção pendurada no fim da linha e o nome do
 * noivo sozinho embaixo —, e a data como "domingo, 22 de agosto de / 2027", com
 * o ano órfão. Num convite cujo único elemento gráfico é o nome do casal, a
 * quebra é lida.
 */
export function HeroDoCasamento({
  evento,
  agoraMs,
}: {
  evento: EventoPublico;
  agoraMs: number;
}) {
  const alvo = instanteDoEvento(evento.dataEvento, evento.horaEvento, evento.dataPorExtensoFuso);
  const porExtenso = dataPorExtenso(evento.dataEvento);

  return (
    <Stack
      component="header"
      sx={{ gap: 3, alignItems: "center", textAlign: "center", py: { xs: 6, md: 8 } }}
    >
      <Typography variant="overline" component="p" sx={{ color: "primary.dark" }}>
        Save the date
      </Typography>

      <Typography
        variant="h1"
        component="h1"
        sx={{ color: "text.primary", overflowWrap: "anywhere", textWrap: "balance" }}
      >
        {evento.nomeCasal}
      </Typography>

      <Stack sx={{ gap: 0.5, alignItems: "center" }}>
        <Typography
          variant="h2"
          component="p"
          sx={{ color: "primary.dark", textWrap: "balance" }}
        >
          {porExtenso}
        </Typography>
        {evento.horaEvento && (
          <Typography variant="subtitle1" component="p" sx={{ color: "text.secondary" }}>
            às {horaParaExibir(evento.horaEvento)}
          </Typography>
        )}
      </Stack>

      <ContagemRegressiva
        alvoMs={alvo.getTime()}
        agoraInicialMs={agoraMs}
        textoQuandoChegou={`Casamos em ${porExtenso}.`}
      />
    </Stack>
  );
}

export default HeroDoCasamento;
