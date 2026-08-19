import { enviarEmail } from "@/lib/brevo";
import { sql, type Executor } from "@/lib/db";

/**
 * ERRO DE PRODUÇÃO CHEGA A ALGUM LUGAR QUE UMA PESSOA LÊ (H-18, `stack.md` §8).
 *
 * Sem isto, o primeiro a saber que uma foto não chegou é o casal — e a promessa
 * do produto é exatamente essa. O `escopo-core.md` chama este item de o pior
 * débito da tabela, **com data: antes do ensaio**.
 *
 * POR QUE NO BANCO E NÃO NUMA FERRAMENTA: ADR 0004. Resumido — o critério de
 * aceite pede consulta "por evento e por hora, para a noite da festa", ao lado
 * das mídias do mesmo evento. Uma ferramenta externa responde "quantos erros";
 * ela não responde "quais fotos deste casamento estão sem prévia e o que
 * aconteceu com elas", que é a única pergunta que alguém vai fazer às 23h.
 *
 * O QUE NUNCA ENTRA: nome, telefone, rótulo, conteúdo de foto, valor de cookie,
 * token. `sanearMensagem` é a última barreira, e ela existe porque mensagem de
 * exceção é o lugar mais fácil do mundo para um dado aparecer sem ninguém
 * planejar — basta alguém escrever `new Error(\`convidado ${rotulo} sem slot\`)`.
 */

export type OrigemDoErro = "servidor" | "cliente" | "alerta";
/**
 * QUATRO VALORES, e o quarto foi a correção mais barata desta fatia (migration
 * 0011, `metricas.md` §6.2).
 *
 * `rede` é a internet que CAIU — a resposta certa é não fazer nada, a fila
 * existe para isso. `portal` é a internet que MENTIU: o wifi do salão responde
 * HTML com status 200, o envio parece ter completado e a foto não existe. É o
 * único erro desta lista que produz **perda silenciosa**, e o único em que agir
 * é obrigatório. Colapsados num valor só, o painel do dia recomendaria "não faça
 * nada" no único caso em que agir é obrigatório.
 */
export type TipoDeErro = "rede" | "portal" | "servidor" | "arquivo";

export type RegistroDeErro = {
  origem: OrigemDoErro;
  /** A rota DECLARADA (`lib/rotas.ts`), nunca a URL crua: a URL leva slug e token. */
  rota: string;
  sessaoTipo: string;
  eventoId?: string | null;
  tipoErro?: TipoDeErro | null;
  classe?: string | null;
  mensagem?: string | null;
  httpStatus?: number | null;
  midiaId?: string | null;
};

/** Tudo que parece token de 64 hexadecimais some antes de virar linha. */
const TOKEN = /\b[0-9a-f]{64}\b/gi;
/** E-mail. O do casal é dado pessoal mesmo sendo o destinatário do produto. */
const EMAIL = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g;
/**
 * Sequência longa de dígitos — telefone, documento, cartão —, **sem comer
 * uuid**.
 *
 * A primeira versão era `\b\d{7,}\b` e transformava
 * `11111111-1111-4111-8111-111111111111` em `[numero]-1111-…-[numero]`. O
 * defeito não apagava dado nenhum a mais; apagava a única coisa que liga um erro
 * a uma mídia específica na noite da festa — e quem fosse investigar às 23h
 * encontraria um registro sem sujeito. O uuid entra na alternância PRIMEIRO e é
 * devolvido intacto.
 */
const DIGITOS =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b\d{7,}\b/gi;

const TETO_DA_MENSAGEM = 300;

/**
 * A mensagem, sem o que ela não deveria carregar.
 *
 * Não é paranoia teórica: `Error` com interpolação é o padrão de todo mundo, e
 * a interpolação mais natural numa rota de mídia é justamente o rótulo de quem
 * enviou. Uuid FICA — ele é opaco e é a única forma de ligar um erro a uma
 * mídia na noite da festa.
 */
export function sanearMensagem(bruta: unknown): string {
  const texto = typeof bruta === "string" ? bruta : String(bruta ?? "");
  return texto
    .replace(TOKEN, "[token]")
    .replace(EMAIL, "[email]")
    .replace(DIGITOS, achado => (achado.includes("-") ? achado : "[numero]"))
    .slice(0, TETO_DA_MENSAGEM);
}

/**
 * Registra. **Nunca estoura.**
 *
 * Um registrador de erro que lança transforma um 500 num 500 diferente e apaga o
 * rastro do primeiro — o defeito passa a ser sobre a ferramenta de diagnóstico,
 * e a causa original nunca é escrita. Se o `insert` falhar, sobra o `console`,
 * que é o log da plataforma.
 */
export async function registrarErro(
  registro: RegistroDeErro,
  exec: Executor = sql
): Promise<void> {
  const mensagem = registro.mensagem ? sanearMensagem(registro.mensagem) : null;
  try {
    await exec`
      insert into eventos_de_erro
        (evento_id, origem, rota, sessao_tipo, tipo_erro, classe, mensagem, http_status, midia_id)
      values
        (${registro.eventoId ?? null}, ${registro.origem}, ${registro.rota},
         ${registro.sessaoTipo}, ${registro.tipoErro ?? null},
         ${registro.classe ?? null}, ${mensagem},
         ${registro.httpStatus ?? null}, ${registro.midiaId ?? null})
    `;
  } catch (falha) {
    console.error("[casa-nos] nao consegui registrar o erro:", sanearMensagem(falha));
    return;
  }

  if (registro.origem !== "alerta") {
    await avaliarAlertaDeTaxa(registro.eventoId ?? null, exec);
  }
}

/* ------------------------------------------------------------------ *
 * O alerta
 * ------------------------------------------------------------------ */

/** 2% dos envios numa janela de 15 minutos (H-18). */
const FRACAO_LIMITE = 0.02;
const JANELA_MINUTOS = 15;
/** Abaixo disto qualquer fração é ruído: 1 erro em 3 envios é 33%. */
const PISO_DE_ERROS = 5;
/** Um alerta por meia hora. Alerta que repete a cada erro vira ruído ignorado. */
const DEBOUNCE_MINUTOS = 30;

/**
 * "Taxa de erro `servidor` passa de 2% dos envios numa janela de 15 minutos."
 *
 * O DENOMINADOR É O QUE TORNA ISSO UTILIZÁVEL: 40 erros numa festa de 4.000
 * fotos é ruído; 40 erros em 200 fotos é o produto quebrado. Um alerta por
 * contagem absoluta dispara na festa grande e cala na festa pequena — que é o
 * contrário do que se quer.
 *
 * O piso existe porque a fração mente com número pequeno: às 19h, com três
 * envios, um erro é 33%.
 *
 * O QUE NÃO ESTÁ AQUI, e está registrado como ausência deliberada em
 * `docs/fatia-1-f1-1-f1-2.md`: o alerta de "adoções por reconciliação passam de
 * 5 numa hora" e o de "o cron diário não rodou". Os dois são sobre a
 * reconciliação (H-15), que é da F1.6 — um alerta sobre um processo que ainda
 * não existe dispararia sobre nada ou nunca, e nos dois casos ensinaria a
 * ignorá-lo.
 */
async function avaliarAlertaDeTaxa(
  eventoId: string | null,
  exec: Executor
): Promise<void> {
  const destino = process.env.ALERTA_EMAIL;
  if (!destino) return;

  try {
    const [contagens] = await exec`
      select
        (select count(*)::int from eventos_de_erro
          where origem in ('servidor', 'cliente')
            and criado_em > now() - (${JANELA_MINUTOS} * interval '1 minute')) as erros,
        (select count(*)::int from midias
          where criada_em > now() - (${JANELA_MINUTOS} * interval '1 minute')) as envios,
        (select count(*)::int from eventos_de_erro
          where origem = 'alerta'
            and criado_em > now() - (${DEBOUNCE_MINUTOS} * interval '1 minute')) as alertas
    `;

    const erros = Number(contagens?.erros ?? 0);
    const envios = Number(contagens?.envios ?? 0);
    const alertas = Number(contagens?.alertas ?? 0);

    if (alertas > 0) return;
    if (erros < PISO_DE_ERROS) return;
    if (envios > 0 && erros / envios <= FRACAO_LIMITE) return;

    await exec`
      insert into eventos_de_erro (evento_id, origem, rota, sessao_tipo, mensagem)
      values (${eventoId}, 'alerta', 'interno/alerta-de-taxa', 'cron',
              ${`${erros} erros para ${envios} envios em ${JANELA_MINUTOS} min`})
    `;

    await enviarEmail({
      para: destino,
      assunto: "casa-nos: taxa de erro acima do limite",
      texto:
        `Nos ultimos ${JANELA_MINUTOS} minutos: ${erros} erros para ${envios} envios.\n` +
        `Limite: ${FRACAO_LIMITE * 100}% dos envios.\n\n` +
        `Consulta da noite (por evento e por hora):\n` +
        `  select date_trunc('hour', criado_em) as hora, rota, tipo_erro, count(*)\n` +
        `    from eventos_de_erro\n` +
        `   where criado_em > now() - interval '6 hours'\n` +
        `   group by 1, 2, 3 order by 1 desc;\n`,
    });
  } catch (falha) {
    console.error("[casa-nos] alerta nao saiu:", sanearMensagem(falha));
  }
}

/**
 * Um alerta ao dono, fora do caminho de erro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OS DOIS ALERTAS QUE FALTAVAM À H-18 ENTRARAM AQUI NA F1.6: "adoções por
 * reconciliação passam de 5 numa hora" e "objeto público de mídia privada".
 * Eles não existiam na F1.2 porque o processo que eles observam não existia — e
 * um alerta sobre um processo inexistente dispara sobre nada ou nunca, e nos dois
 * casos ensina quem o recebe a ignorá-lo.
 *
 * O TERCEIRO DA LISTA — "o cron diário não rodou" — **continua sem existir como
 * alerta, e a ausência é declarada**: um processo não consegue avisar que não
 * rodou. O que existe no lugar é evidência num lugar onde uma pessoa olha:
 * `evento_contadores.recomputado_em` viaja no painel do dia ao vivo, ao lado do
 * sinal do telão. Um vigia de verdade é um serviço externo batendo numa rota —
 * configuração, não código, e está escrito no README.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **NUNCA ESTOURA**, pelo mesmo motivo de `registrarErro`: um alerta que lança
 * transforma o incidente que ele deveria contar num incidente sobre a ferramenta
 * de diagnóstico.
 */
export async function alertar(
  assunto: string,
  texto: string,
  exec: Executor = sql
): Promise<void> {
  const destino = process.env.ALERTA_EMAIL;
  await registrarErro(
    {
      origem: "alerta",
      rota: "interno/alerta",
      sessaoTipo: "cron",
      tipoErro: "servidor",
      classe: "alerta",
      mensagem: assunto,
    },
    exec
  );
  if (!destino) return;
  try {
    await enviarEmail({ para: destino, assunto, texto });
  } catch (falha) {
    console.error("[casa-nos] alerta nao saiu:", sanearMensagem(falha));
  }
}
