import { ehDiaPuro, ehHoraPura } from "@/lib/datas";
import type { Evento, NivelDeRevelacao } from "@/lib/eventos";

/**
 * A CAPA E O "ONDE E QUANDO" — a validação (v1.0, V-04 e V-05).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Os dois editores escrevem colunas de `eventos`, e por isso compartilham uma
 * rota (`PATCH /api/eventos/[id]/site/evento`). O que eles **não** compartilham é
 * o significado: a capa é quem casa e quando; o "onde" é quanto do lugar o site
 * conta hoje. As regras de cada um estão separadas abaixo pelo mesmo motivo.
 *
 * **TUDO É VALIDADO NO SERVIDOR** (RV-09). O teto da tela é conveniência; um
 * `PATCH` montado à mão passa por cima dele, e o `CHECK` do banco viraria 500
 * onde a resposta certa é 400 com a frase do campo.
 *
 * **DATA E HORA NUNCA PASSAM POR `new Date`** (RV-10). `data_evento` é `date` e
 * chega como `"2027-08-22"`; `hora_evento` é `time` e chega como `"16:00"`.
 * `new Date("2027-08-22")` é meia-noite em UTC — 21h do dia 21 em Brasília — e
 * o site anunciaria a data errada do casamento. Os verificadores de
 * `lib/datas.ts` olham a STRING.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Medidos contra a coluna de 640 px do site e o viewport de 360 px. */
export const TETOS_DO_EVENTO = {
  nomeCasal: 60,
  cidade: 60,
  uf: 2,
  localNome: 80,
  localEndereco: 200,
} as const;

/**
 * Os limites do ponto e da área.
 *
 * O raio mínimo de 200 m não é capricho: abaixo disso a "região" identifica a
 * quadra, e o casal que escolheu `regiao` justamente para o lugar não ser
 * identificável teria o contrário do que pediu. O máximo de 20 km é o ponto em
 * que a área deixa de dizer para que lado da cidade o convidado vai.
 */
export const LIMITES_DO_MAPA = {
  latitude: [-90, 90],
  longitude: [-180, 180],
  raioMetros: [200, 20_000],
} as const;

export type ErrosPorCampo = Record<string, string>;

export type MudancaDoEvento = {
  nomeCasal?: string;
  dataEvento?: string;
  horaEvento?: string | null;
  horaPublicada?: boolean;
  cidade?: string;
  uf?: string;
  localNome?: string | null;
  localNomePublicado?: boolean;
  localRevelacao?: NivelDeRevelacao;
  localLatitude?: number | null;
  localLongitude?: number | null;
  localRaioMetros?: number | null;
  localEndereco?: string | null;
};

function textoOuNulo(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  return limpo === "" ? null : limpo;
}

/**
 * Confere o que chegou e devolve a mudança e os erros **por campo**.
 *
 * O erro aparece NO CAMPO, e por isso ele viaja identificado por campo. Um
 * alerta no topo resumindo o que aconteceu embaixo é reprovação do design
 * system — e, no celular, o alerta fica fora da tela quando a pessoa está no
 * campo errado.
 *
 * `atual` entra porque **três regras dependem do estado gravado**: publicar o
 * horário sem ter horário, publicar o nome do local sem ter nome, e pôr o mapa
 * em `exato` sem endereço. Sem o atual, o casal que salvasse só a flag receberia
 * 400 mesmo tendo o campo preenchido no banco — ou, pior, passaria e o site
 * anunciaria um campo vazio.
 */
export function conferirEvento(
  bruto: unknown,
  atual: Evento
): { mudanca: MudancaDoEvento; erros: ErrosPorCampo } {
  const erros: ErrosPorCampo = {};
  const mudanca: MudancaDoEvento = {};

  if (!bruto || typeof bruto !== "object") {
    return { mudanca, erros: { corpo: "Mande os campos do site." } };
  }
  const campos = bruto as Record<string, unknown>;

  /* --- A capa (V-04) --- */

  if (campos.nome_casal !== undefined) {
    const nome = textoOuNulo(campos.nome_casal);
    if (!nome) {
      erros.nome_casal = "Escreva como vocês querem aparecer no site.";
    } else if (nome.length > TETOS_DO_EVENTO.nomeCasal) {
      erros.nome_casal = `Cabe em ${TETOS_DO_EVENTO.nomeCasal} caracteres, e você escreveu ${nome.length}.`;
    } else {
      mudanca.nomeCasal = nome;
    }
  }

  if (campos.data_evento !== undefined) {
    const data = textoOuNulo(campos.data_evento);
    // `ehDiaPuro` olha a STRING `AAAA-MM-DD`. Passar por `Date` aqui devolveria
    // o dia anterior no servidor, que roda em UTC.
    if (!data || !ehDiaPuro(data)) {
      erros.data_evento = "Escolha a data do casamento.";
    } else {
      mudanca.dataEvento = data;
    }
  }

  if (campos.hora_evento !== undefined) {
    const hora = textoOuNulo(campos.hora_evento);
    if (hora === null) {
      // Nulo SIGNIFICA "ainda não definido", e o casal precisa poder voltar a
      // esse estado — por isso o campo aceita ser esvaziado.
      mudanca.horaEvento = null;
    } else if (!ehHoraPura(hora)) {
      erros.hora_evento = "O horário vai no formato 16:00.";
    } else {
      mudanca.horaEvento = hora;
    }
  }

  if (campos.hora_publicada !== undefined) {
    mudanca.horaPublicada = campos.hora_publicada === true;
  }

  for (const [chave, campo, rotulo, teto] of [
    ["cidade", "cidade", "O nome da cidade", TETOS_DO_EVENTO.cidade],
    ["uf", "uf", "O estado", TETOS_DO_EVENTO.uf],
  ] as const) {
    if (campos[campo] === undefined) continue;
    const valor = textoOuNulo(campos[campo]);
    if (!valor) {
      erros[campo] = chave === "uf" ? "Escreva o estado (2 letras)." : "Escreva a cidade.";
    } else if (valor.length > teto) {
      erros[campo] = `${rotulo} cabe em ${teto} caracteres, e você escreveu ${valor.length}.`;
    } else if (chave === "uf") {
      mudanca.uf = valor.toUpperCase();
    } else {
      mudanca.cidade = valor;
    }
  }

  /* --- Onde e quando (V-05) --- */

  if (campos.local_nome !== undefined) {
    const nome = textoOuNulo(campos.local_nome);
    if (nome && nome.length > TETOS_DO_EVENTO.localNome) {
      erros.local_nome = `Cabe em ${TETOS_DO_EVENTO.localNome} caracteres, e você escreveu ${nome.length}.`;
    } else {
      mudanca.localNome = nome;
    }
  }

  if (campos.local_nome_publicado !== undefined) {
    mudanca.localNomePublicado = campos.local_nome_publicado === true;
  }

  if (campos.local_endereco !== undefined) {
    const endereco = textoOuNulo(campos.local_endereco);
    if (endereco && endereco.length > TETOS_DO_EVENTO.localEndereco) {
      erros.local_endereco = `Cabe em ${TETOS_DO_EVENTO.localEndereco} caracteres, e você escreveu ${endereco.length}.`;
    } else {
      mudanca.localEndereco = endereco;
    }
  }

  if (campos.local_revelacao !== undefined) {
    const nivel = campos.local_revelacao;
    if (nivel === "oculto" || nivel === "regiao" || nivel === "exato") {
      mudanca.localRevelacao = nivel;
    } else {
      erros.local_revelacao = "Escolha quanto do local o site conta.";
    }
  }

  for (const [campo, chave, rotulo] of [
    ["local_latitude", "localLatitude", "latitude"],
    ["local_longitude", "localLongitude", "longitude"],
    ["local_raio_metros", "localRaioMetros", "raioMetros"],
  ] as const) {
    if (campos[campo] === undefined) continue;
    const cru = campos[campo];
    if (cru === null || cru === "") {
      mudanca[chave] = null;
      continue;
    }
    const numero = Number(cru);
    const [minimo, maximo] = LIMITES_DO_MAPA[rotulo];
    if (!Number.isFinite(numero)) {
      erros[campo] = "Escreva só o número.";
    } else if (numero < minimo || numero > maximo) {
      // O intervalo escrito, não "valor inválido": quem digitou 43 no lugar de
      // -43 precisa ver o que é aceito.
      erros[campo] = `Precisa estar entre ${minimo} e ${maximo}.`;
    } else if (rotulo === "raioMetros" && !Number.isInteger(numero)) {
      erros[campo] = "O raio vai em metros inteiros.";
    } else {
      mudanca[chave] = numero;
    }
  }

  /* --- As três regras que dependem do estado gravado --- */

  const depois = { ...atual, ...mudanca };

  if (depois.horaPublicada && !depois.horaEvento) {
    // A frase vai no campo do HORÁRIO, e não no da flag: o que falta é o
    // horário, e é lá que a pessoa precisa digitar.
    erros.hora_evento = "Preencha o horário para poder anunciá-lo no site.";
  }

  if (depois.localNomePublicado && !depois.localNome) {
    erros.local_nome = "Preencha o nome do local para poder anunciá-lo.";
  }

  if (depois.localRevelacao === "exato" && !depois.localEndereco) {
    erros.local_endereco = "Com o endereço exato no ar, ele precisa estar escrito.";
  }

  if (
    (depois.localRevelacao === "regiao" || depois.localRevelacao === "exato") &&
    (depois.localLatitude === null || depois.localLongitude === null)
  ) {
    erros.local_latitude = "Sem o ponto no mapa não dá para desenhar nada aqui.";
  }

  return { mudanca, erros };
}
