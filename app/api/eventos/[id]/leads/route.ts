import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { agoraNoServidor, partesLocais } from "@/lib/datas";
import { ehUuid } from "@/lib/ids";
import {
  mesDe,
  mesPrevistoValido,
  normalizarContato,
  registrarLead,
  type SuperficieDoCta,
} from "@/lib/leads";
import { participacaoDaSessao } from "@/lib/sessao";
import { TEXTO_DA_PERMISSAO } from "@/lib/textos-do-loop";

/**
 * O LEAD DO LOOP (H-16).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `evento_id_origem` VEM DA URL, NUNCA DO CORPO — e essa é a linha mais
 * importante deste arquivo.
 *
 * É o `referring_wedding_id`, o campo que faz o loop existir: o clique acontece
 * na festa, no celular, e o cadastro acontece meses depois, noutro aparelho, sem
 * cookie (`analytics_storage: denied`). Sem esta coluna preenchida **no
 * servidor**, o número que decide se este negócio tem canal de aquisição sai
 * zero por construção (`metricas.md` §14.6).
 *
 * Vindo do corpo, ele seria entrada de usuário — e a origem de um lead viraria
 * algo que qualquer um escreve. Vindo da URL, ele já passou por `ehUuid` e por
 * `autorizar`, que confere que o evento existe e que quem pede tem participação
 * ativa nele. `test/leads.test.ts` prova que esta rota **não consegue** criar um
 * lead sem origem.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O WHATSAPP FICA AQUI E NÃO VAI PARA O GA4 (RN-24). Para o GA4 saem `has_date`
 * e `expected_month` — e quem os envia é a tela, com os valores que voltam desta
 * resposta.
 */

const CAMINHO = "/api/eventos/[id]/leads";

const SUPERFICIES: SuperficieDoCta[] = ["confirmacao_envio", "album", "feed", "telao"];

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "lead.criar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const bruto = corpo as Record<string, unknown>;

  /**
   * ERRO **NO CAMPO**, SEMPRE (H-16). O corpo do 400 diz qual campo e com qual
   * frase — a tela põe a mensagem embaixo do campo, nunca um alerta no topo
   * resumindo o que aconteceu embaixo.
   */
  const contato = normalizarContato(bruto.contato);
  if (!contato) return pedidoInvalido({ contato: "Faltam dígitos nesse número." });

  const temData = bruto.tem_data === true;
  let mesPrevisto: string | null = null;
  if (temData) {
    // "Daqui para a frente" é medido no fuso do EVENTO, e não no do servidor:
    // entre 21h e meia-noite em Brasília o servidor em UTC já está no dia
    // seguinte, e no fim de um mês isso recusaria o mês corrente (`dados.md` §4).
    const hoje = partesLocais(agoraNoServidor(), acesso.evento.fuso).dia;
    if (!mesPrevistoValido(bruto.mes_previsto, mesDe(hoje))) {
      return pedidoInvalido({ mes_previsto: "Escolha um mês daqui para a frente." });
    }
    mesPrevisto = bruto.mes_previsto as string;
  }

  /**
   * O TEXTO DA PERMISSÃO É CONFERIDO, NÃO ACEITO.
   *
   * A coluna guarda o que a pessoa leu, e é isso que torna o consentimento
   * verificável daqui a um ano. Gravar o que o corpo mandar deixaria um cliente
   * adulterado inventar a frase; não mandar nada deixaria a redação do banco
   * descolar da redação da tela na primeira edição de copy. A frase é uma só
   * (`lib/textos-do-loop.ts`), e o que não bate com ela é 400.
   */
  if (bruto.permissao_texto !== TEXTO_DA_PERMISSAO) {
    return pedidoInvalido("permissao_texto divergente");
  }

  const ctaSuperficie =
    SUPERFICIES.find(s => s === bruto.cta_superficie) ?? "confirmacao_envio";

  const participacao = participacaoDaSessao(acesso.sessao);

  const lead = await registrarLead({
    // Da URL, já validado. Nunca do corpo. Ver o cabeçalho.
    eventoIdOrigem: acesso.evento.id,
    participacaoId: participacao?.id ?? null,
    contato,
    nome: typeof bruto.nome === "string" && bruto.nome.trim() ? bruto.nome.trim() : null,
    temData,
    mesPrevisto,
    ctaSuperficie,
    permissaoTexto: TEXTO_DA_PERMISSAO,
  });

  /**
   * 201 mesmo quando o contato já existia. Não é descuido: para quem deixou o
   * contato **não aconteceu nada diferente**, e a folha reenvia sozinha quando a
   * rede volta. Um 409 aqui faria a tela mostrar erro para alguém que fez tudo
   * certo, na segunda tentativa de um envio que a primeira já tinha completado.
   */
  return NextResponse.json(
    {
      id: lead.id,
      ja_existia: lead.jaExistia,
      // Os dois únicos campos que a tela repassa ao GA4. O contato não está
      // aqui, e não é por economia de bytes.
      has_date: temData,
      expected_month: mesPrevisto ?? "",
      cta_surface: ctaSuperficie,
    },
    { status: 201 }
  );
});
