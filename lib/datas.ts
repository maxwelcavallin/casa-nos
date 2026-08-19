/**
 * Datas — sempre America/Sao_Paulo, e nunca passando por `new Date(string)`.
 *
 * POR QUE EXISTE: o servidor roda em UTC. `new Date("2027-08-22")` é meia-noite
 * em UTC, que no Brasil é 21h do dia 21 — um dia a menos em TODA data sem hora.
 * Numa página de casamento isso não é um detalhe de relatório: é o site
 * anunciando a data errada do casamento.
 *
 * Tudo aqui é testado com `TZ=UTC` (`test/datas.test.ts`), porque é assim que a
 * Vercel roda e é o único jeito de o teste reproduzir o defeito.
 */

export const FUSO = "America/Sao_Paulo";

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

const DIAS_DA_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

const DIA_PURO = /^\d{4}-\d{2}-\d{2}$/;
/** `16:00` ou `16:00:00` — que é como o Postgres devolve `time`. */
const HORA_PURA = /^\d{2}:\d{2}(:\d{2})?$/;

export function ehDiaPuro(valor: unknown): valor is string {
  return typeof valor === "string" && DIA_PURO.test(valor);
}

export function ehHoraPura(valor: unknown): valor is string {
  return typeof valor === "string" && HORA_PURA.test(valor);
}

/** `"2027-08-22"` → `[2027, 8, 22]`. Lança se o formato não for dia puro. */
function partesDoDia(dia: string): [number, number, number] {
  if (!ehDiaPuro(dia)) throw new Error(`Dia inválido: ${dia}`);
  const [ano, mes, d] = dia.split("-").map(Number);
  return [ano, mes, d];
}

/**
 * `"2027-08-22"` → `"22/08/2027"`.
 *
 * Formata a STRING, sem passar por `Date`. Ver o comentário do topo.
 */
export function dataParaExibir(dia: string): string {
  const [ano, mes, d] = partesDoDia(dia);
  return `${String(d).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

/**
 * `"2027-08-22"` → `"domingo, 22 de agosto de 2027"`.
 *
 * O dia da semana sai de `Date.UTC` — que é aritmética de calendário pura, sem
 * fuso envolvido — e não de `toLocaleDateString`, que precisaria de um instante
 * e traria o problema de volta.
 */
export function dataPorExtenso(dia: string): string {
  const [ano, mes, d] = partesDoDia(dia);
  const diaDaSemana = DIAS_DA_SEMANA[new Date(Date.UTC(ano, mes - 1, d)).getUTCDay()];
  return `${diaDaSemana}, ${d} de ${MESES[mes - 1]} de ${ano}`;
}

/** `"16:00:00"` → `"16h"`; `"16:30:00"` → `"16h30"`. */
export function horaParaExibir(hora: string): string {
  if (!ehHoraPura(hora)) throw new Error(`Hora inválida: ${hora}`);
  const [hh, mm] = hora.split(":");
  return mm === "00" ? `${Number(hh)}h` : `${Number(hh)}h${mm}`;
}

/**
 * Quantos minutos o fuso está deslocado de UTC NAQUELE instante.
 *
 * Existe porque o Brasil já teve horário de verão e pode voltar a ter: chumbar
 * `-03:00` no código funciona hoje e passa a errar uma hora no dia em que a lei
 * mudar — e o erro apareceria como a contagem regressiva zerando uma hora cedo,
 * o que ninguém investigaria a tempo.
 */
function deslocamentoEmMinutos(instante: Date, fuso: string): number {
  const formatador = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const parte of formatador.formatToParts(instante)) {
    if (parte.type !== "literal") p[parte.type] = parte.value;
  }
  // `hour` volta como "24" à meia-noite em alguns ambientes.
  const hora = Number(p.hour) % 24;
  const comoSeFosseUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    hora,
    Number(p.minute),
    Number(p.second)
  );
  return (comoSeFosseUtc - instante.getTime()) / 60000;
}

/**
 * Dia + hora locais → o instante real (UTC) correspondente.
 *
 * `instanteDoEvento("2027-08-22", "16:00")` devolve 22/08/2027 16h **em São
 * Paulo**, que é 19h em UTC. É este número que a contagem regressiva persegue.
 *
 * Hora nula vira meia-noite: sem horário divulgado, a contagem persegue o
 * começo do dia do casamento. Está escrito na página como "faltam X dias",
 * então a ausência de hora não vira uma precisão que não existe.
 *
 * As duas iterações resolvem o caso de borda em que o palpite cai do outro lado
 * de uma mudança de deslocamento: a primeira aproxima, a segunda confirma.
 */
export function instanteDoEvento(
  dia: string,
  hora: string | null,
  fuso: string = FUSO
): Date {
  const [ano, mes, d] = partesDoDia(dia);
  const [hh, mm, ss] =
    hora && ehHoraPura(hora)
      ? [
          Number(hora.slice(0, 2)),
          Number(hora.slice(3, 5)),
          // Os segundos entram porque a janela de envio fecha às 23:59:59
          // (RN-08). Sem eles, o último minuto do sétimo dia ficaria de fora e o
          // convidado que manda 23:59:30 receberia "fora da janela".
          hora.length >= 8 ? Number(hora.slice(6, 8)) : 0,
        ]
      : [0, 0, 0];

  const comoSeFosseUtc = Date.UTC(ano, mes - 1, d, hh, mm, ss);
  let instante = comoSeFosseUtc;
  for (let i = 0; i < 2; i++) {
    instante = comoSeFosseUtc - deslocamentoEmMinutos(new Date(instante), fuso) * 60000;
  }
  return new Date(instante);
}

export type ContagemRegressiva = {
  dias: number;
  horas: number;
  minutos: number;
  segundos: number;
  /** `true` quando o instante já passou — a página troca de texto, não mostra negativo. */
  chegou: boolean;
};

/**
 * Diferença entre dois instantes, em dias/horas/minutos/segundos.
 *
 * Função pura, com o "agora" recebido por parâmetro. É o que permite testá-la
 * sem relógio falso — e é o que permite o servidor e o cliente renderizarem o
 * MESMO valor na primeira pintura, sem erro de hidratação.
 */
export function contagemAte(alvo: Date, agora: Date): ContagemRegressiva {
  const restante = alvo.getTime() - agora.getTime();
  if (restante <= 0) {
    return { dias: 0, horas: 0, minutos: 0, segundos: 0, chegou: true };
  }
  const segundosTotais = Math.floor(restante / 1000);
  return {
    dias: Math.floor(segundosTotais / 86400),
    horas: Math.floor((segundosTotais % 86400) / 3600),
    minutos: Math.floor((segundosTotais % 3600) / 60),
    segundos: segundosTotais % 60,
    chegou: false,
  };
}

/**
 * O "agora" do servidor, num lugar só.
 *
 * Existe por duas razões, e as duas são o padrão da casa:
 *
 * 1. Tudo que envolve dia e hora mora em `lib/datas.ts`. Um `Date.now()` solto
 *    dentro de uma página é a primeira pedra do caminho que leva a cada tela
 *    tendo a sua própria ideia de que horas são.
 *
 * 2. O React Compiler recusa `Date.now()` no corpo de um componente, e com
 *    razão para componente de cliente: o valor muda a cada renderização e
 *    produz resultado instável. Aqui o componente é de SERVIDOR e assíncrono, e
 *    o instante é justamente o dado que a página precisa pinar para mandar ao
 *    cliente — mas a regra não distingue os dois casos, e discutir com ela por
 *    exceção sairia mais caro que ter esta função, que o produto queria de
 *    qualquer jeito.
 */
export function agoraNoServidor(): Date {
  return new Date();
}

/* ------------------------------------------------------------------ *
 * A janela de envio (Fatia 1, H-02 / RN-08)
 * ------------------------------------------------------------------ */

/**
 * `somarDias("2027-08-22", -1)` → `"2027-08-21"`.
 *
 * Aritmética de CALENDÁRIO, com `Date.UTC` — que não tem fuso envolvido — e não
 * `new Date(dia)`, que já seria meia-noite em UTC e devolveria o dia anterior
 * aqui. A saída é string pura, do mesmo formato da entrada, porque quem consome
 * é `instanteDoEvento` e não um `Date`.
 *
 * A virada de mês e de ano sai de graça: `Date.UTC(2027, 11, 32)` é 1º de
 * janeiro de 2028, e é assim que um casamento em 31 de dezembro tem janela até
 * 7 de janeiro sem nenhum caso especial escrito.
 */
export function somarDias(dia: string, dias: number): string {
  const [ano, mes, d] = partesDoDia(dia);
  const movido = new Date(Date.UTC(ano, mes - 1, d + dias));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${movido.getUTCFullYear()}-${p(movido.getUTCMonth() + 1)}-${p(movido.getUTCDate())}`;
}

/**
 * O padrão da janela de envio: abre D−1 às 00:00, fecha D+7 às 23:59:59, no
 * fuso do EVENTO (RN-08).
 *
 * DUAS COISAS QUE PARECEM DETALHE E NÃO SÃO:
 *
 * 1. **O resultado é um INSTANTE**, não um dia. É ele que vai para
 *    `timestamptz`, e é por isso que a mesma janela significa o mesmo momento no
 *    servidor da Vercel (UTC) e no celular do convidado (Brasília). Guardar
 *    "22/08 até 29/08" como data faria a consulta depender do fuso do processo,
 *    e o envio das 00:30 do dia seguinte à festa — que a RN-08 manda aceitar —
 *    cairia fora em um dos dois ambientes.
 * 2. **O fuso vem do evento**, não da constante `FUSO`. Hoje todo evento é em
 *    São Paulo; o dia em que um não for, a janela dele não pode seguir o
 *    horário de Brasília.
 *
 * `test/janela-de-envio.test.ts` roda em `TZ=UTC` e
 * `test/janela-de-envio.brasilia.test.ts` roda em `TZ=America/Sao_Paulo`: os
 * dois exigem os MESMOS instantes. É a catraca da §9.2 do PRD.
 */
export function janelaDeEnvioPadrao(
  dataEvento: string,
  fuso: string = FUSO
): { abre: Date; fecha: Date } {
  return {
    abre: instanteDoEvento(somarDias(dataEvento, -1), "00:00:00", fuso),
    fecha: instanteDoEvento(somarDias(dataEvento, 7), "23:59:59", fuso),
  };
}

/**
 * Instante → `"2027-08-21T03:00"`, no fuso do evento, para preencher um
 * `<input type="datetime-local">`.
 *
 * POR QUE NÃO `toISOString().slice(0,16)`: isso mostra o instante em UTC, e o
 * casal veria a janela dele começando às 03:00 do dia 21. O campo diria uma hora
 * que ele não escolheu, ele "corrigiria", e a janela real mudaria três horas.
 *
 * Vai e volta com `instanteDoInputLocal`, que é a metade que lê o campo.
 */
export function paraInputLocal(instante: Date | null, fuso: string = FUSO): string {
  if (!instante) return "";
  const formatador = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const parte of formatador.formatToParts(instante)) {
    if (parte.type !== "literal") p[parte.type] = parte.value;
  }
  const hora = String(Number(p.hour) % 24).padStart(2, "0");
  return `${p.year}-${p.month}-${p.day}T${hora}:${p.minute}`;
}

/**
 * `"2027-08-21T00:00"` (o que o `<input datetime-local>` manda) → o instante
 * real naquele fuso.
 *
 * Devolve `null` para vazio e para formato incompleto — que é o caso da "data
 * incompleta" da H-02, e é erro de campo, não exceção.
 */
export function instanteDoInputLocal(
  valor: string | null | undefined,
  fuso: string = FUSO
): Date | null {
  if (!valor) return null;
  const casa = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(valor.trim());
  if (!casa) return null;
  return instanteDoEvento(casa[1], `${casa[2]}:${casa[3]}:${casa[4] ?? "00"}`, fuso);
}
