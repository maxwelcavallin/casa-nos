import { dataParaExibir, horaParaExibir } from "@/lib/datas";
import type { Evento } from "@/lib/eventos";
import type { ChaveDeSecao } from "@/lib/secoes";

/**
 * O RESUMO DE UMA LINHA DE CADA SEÇÃO — o que responde "o que eu faço agora?".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A Marina abre o painel do celular, à noite, depois do trabalho
 * (`pesquisa.md` §persona). Ela tem cinco minutos e precisa saber, de relance,
 * **o que ainda falta**. Uma lista de sete nomes de seção não responde isso; uma
 * lista com "3 hotéis", "sem texto ainda" e "22/08/2027, às 16h" responde.
 *
 * `faltaPreencher` é a marca do estado que importa: **ligada e vazia**. Ela é o
 * único estado que o casal precisa agir sobre — e é o mesmo estado que faz a
 * seção não renderizar no site (RV-02). O painel diz a consequência em vez de
 * só nomear o vazio.
 *
 * **FUNÇÃO PURA**, sem banco e sem `Date`. A data sai de `lib/datas.ts` a partir
 * da string `AAAA-MM-DD` (`dados.md` §5): passar por `new Date` mostraria o dia
 * anterior no servidor em UTC, e o painel anunciaria a data errada do casamento
 * do próprio casal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** O que existe hoje dentro de cada seção, contado no servidor. */
export type ContagemDoConteudo = {
  indicacoes: number;
  programacao: number;
  /** Só as respondidas contam: pergunta sem resposta não renderiza (RV-02). */
  perguntasRespondidas: number;
  perguntasTotal: number;
  historiaTemTexto: boolean;
};

export type ResumoDaSecao = {
  texto: string;
  /**
   * Ligada e sem nada dentro. É o que a tela marca como "falta preencher", e é o
   * que faz a seção sumir do site mesmo ligada.
   */
  faltaPreencher: boolean;
};

const PLURAL = (quantos: number, um: string, muitos: string) =>
  `${quantos} ${quantos === 1 ? um : muitos}`;

export function resumirSecao(
  chave: ChaveDeSecao,
  evento: Evento,
  conteudo: ContagemDoConteudo
): ResumoDaSecao {
  switch (chave) {
    case "capa": {
      const data = dataParaExibir(evento.dataEvento);
      // O horário só entra no resumo quando ele está PUBLICADO. O painel repete
      // a decisão do site: enquanto `hora_publicada` for falsa, o horário não é
      // anunciado em lugar nenhum, e mostrá-lo aqui faria o casal achar que já
      // divulgou.
      const hora =
        evento.horaPublicada && evento.horaEvento
          ? `, às ${horaParaExibir(evento.horaEvento)}`
          : "";
      return { texto: `${evento.nomeCasal} — ${data}${hora}`, faltaPreencher: false };
    }

    case "onde": {
      const lugar = evento.localNomePublicado && evento.localNome ? evento.localNome : null;
      const revelacao =
        evento.localRevelacao === "exato"
          ? "endereço no ar"
          : evento.localRevelacao === "regiao"
            ? "só a região"
            : "nada divulgado ainda";
      return {
        texto: lugar
          ? `${lugar} — ${revelacao}`
          : `${evento.cidade}, ${evento.uf} — ${revelacao}`,
        // Nunca "falta preencher": a cidade sempre existe, e a seção sempre
        // renderiza alguma coisa. Esconder o local é uma escolha do casal, não
        // um campo em branco.
        faltaPreencher: false,
      };
    }

    case "programacao":
      return conteudo.programacao === 0
        ? { texto: "Sem nenhum momento ainda", faltaPreencher: true }
        : {
            texto: PLURAL(conteudo.programacao, "momento", "momentos"),
            faltaPreencher: false,
          };

    case "historia":
      return conteudo.historiaTemTexto
        ? { texto: "Texto escrito", faltaPreencher: false }
        : { texto: "Sem texto ainda", faltaPreencher: true };

    case "perguntas": {
      if (conteudo.perguntasTotal === 0) {
        return { texto: "Sem nenhuma pergunta ainda", faltaPreencher: true };
      }
      const semResposta = conteudo.perguntasTotal - conteudo.perguntasRespondidas;
      if (conteudo.perguntasRespondidas === 0) {
        return {
          // Pergunta sem resposta não vai ao ar. A frase diz isso, senão o casal
          // acha que publicou cinco perguntas em branco.
          texto: `${PLURAL(semResposta, "pergunta", "perguntas")} sem resposta`,
          faltaPreencher: true,
        };
      }
      return {
        texto:
          PLURAL(conteudo.perguntasRespondidas, "pergunta respondida", "perguntas respondidas") +
          (semResposta > 0 ? `, ${semResposta} sem resposta` : ""),
        faltaPreencher: false,
      };
    }

    case "indicacoes":
      return conteudo.indicacoes === 0
        ? { texto: "Sem nenhuma indicação ainda", faltaPreencher: true }
        : {
            texto: PLURAL(conteudo.indicacoes, "indicação", "indicações"),
            faltaPreencher: false,
          };

    case "rodape":
      return { texto: "O fecho da página", faltaPreencher: false };
  }
}
