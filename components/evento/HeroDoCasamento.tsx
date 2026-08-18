import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { ContagemRegressiva } from "@/components/evento/ContagemRegressiva";
import { dataPorExtenso, horaParaExibir, instanteDoEvento } from "@/lib/datas";
import type { EventoPublico } from "@/lib/eventos";
import { monograma } from "@/lib/tokens";

/**
 * O topo da página: a marca, quem casa, quando, e quanto falta.
 *
 * O LOCKUP é o da capa do manual: a ligadura A&M sobre os nomes.
 *
 * O monograma entra como MÁSCARA CSS, não como `<img>`. A tinta do PNG é
 * `#10345E`, parecida com o marinho da marca e não igual — ao lado do `h1` em
 * `primary` a diferença aparece. Como máscara, quem pinta é o token, então o
 * monograma É exatamente `primary`, e o mesmo arquivo serviria `onPrimary`
 * sobre foto com véu. Um arquivo, dois usos, zero cor fora do token.
 *
 * Ele NUNCA substitui o `h1` em texto, e isso é regra de acessibilidade: se a
 * máscara falhar, a caixa fica invisível, e o nome do casal não pode depender
 * dela. Daí o `role="img"` com `aria-label` — para leitor de tela ele é uma
 * imagem com legenda, e o `h1` logo abaixo continua sendo a fonte da verdade.
 *
 * `overflowWrap: "anywhere"` porque um casal pode ter quatro nomes e 60
 * caracteres: sem isso o `h1` estoura a lateral no celular e corta letra. Isso
 * pesa mais agora do que na versão anterior: o `h1` virou CAIXA ALTA com
 * `.05em` de tracking, então o mesmo nome ocupa mais largura que antes.
 *
 * `textWrap: "balance"` reparte o texto entre as linhas em vez de encher a
 * primeira e jogar o resto para baixo. Sem ele, em 390px, o nome quebrava como
 * "Ana Flávia e / Maxwel" — a conjunção pendurada no fim da linha e o nome do
 * noivo sozinho embaixo —, e a data com o ano órfão.
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
      <Box
        role="img"
        aria-label={evento.nomeCasal}
        data-monograma
        sx={{
          width: monograma.hero,
          aspectRatio: monograma.proporcao,
          bgcolor: "primary.main",
          maskImage: `url(${monograma.caminho})`,
          WebkitMaskImage: `url(${monograma.caminho})`,
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
        }}
      />

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
        {/*
          A data é `subtitle1`, não `h2`: o manual escreve a data em Montserrat
          caixa alta espaçada, na capa e no cartão de fecho — não em serifa. A
          serifa fica com o nome do casal, que é o que ela existe para carregar.
        */}
        <Typography
          variant="subtitle1"
          component="p"
          sx={{ color: "primary.dark", textWrap: "balance" }}
        >
          {porExtenso}
        </Typography>
        {evento.horaEvento && (
          <Typography variant="body2" component="p" sx={{ color: "text.secondary" }}>
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
