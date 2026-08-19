/**
 * O TESTE DE CARGA SINTETICO (H-21) — **criterio de termino da Fatia 1.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * "Quero saber onde o produto quebra com 200 aparelhos antes de descobrir isso
 * na festa, porque a festa e tiro unico."
 *
 * Ele sobe 200 clientes simulados contra o produto DE VERDADE — pelo HTTP, pelo
 * proxy, pelas rotas, pelo mesmo Postgres. Cada cliente faz o que um convidado
 * faz: le o QR (rota curta), abre o album, registra intencao, confirma as duas
 * faixas e sonda o feed a cada 5 s.
 *
 * O QUE ELE **NAO** MEDE, e esta escrito no relatorio: o uplink do salao. O
 * `PUT` no R2 nao passa pelo nosso servidor (e URL assinada, o aparelho fala
 * direto com o balde), entao nenhum teste que roda deste lado consegue medi-lo.
 * O que este script mede e **o que o produto custa** — as idas ao servidor que
 * entram no orcamento de 30 s do `seconds_since_scan`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Uso:
 *   node scripts/carga.mjs --base=http://localhost:3000 --slug=carga-fatia-1
 *
 * Parametros (todos opcionais):
 *   --clientes=200     aparelhos simulados
 *   --midias=4000      fotos na noite inteira
 *   --escala=120       quantas vezes o tempo e comprimido (6 h / 120 = 3 min)
 *   --sondagem=30      segundos de sondagem a 40 req/s (a pergunta do §7)
 *   --feed=6000        quantos itens semear para medir a abertura do album
 */
import fs from "node:fs"
import path from "node:path"
import { neon } from "@neondatabase/serverless"

const RAIZ = process.cwd()

carregarEnvLocal()

const opcoes = lerOpcoes()
const sql = neon(exigir("DATABASE_URL"))

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

function carregarEnvLocal() {
  for (const nome of [".env.local", ".env"]) {
    const arquivo = path.join(RAIZ, nome)
    if (!fs.existsSync(arquivo)) continue
    for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const valor = m[2].replace(/^["']|["']$/g, "")
      if (valor && !process.env[m[1]]) process.env[m[1]] = valor
    }
  }
}

function exigir(nome) {
  const valor = process.env[nome]
  if (!valor) {
    console.error(`${nome} nao configurada. Sem ela este teste nao mede nada.`)
    process.exit(1)
  }
  return valor
}

function lerOpcoes() {
  const bruto = Object.fromEntries(
    process.argv.slice(2).map(a => {
      const [chave, valor = "true"] = a.replace(/^--/, "").split("=")
      return [chave, valor]
    })
  )
  return {
    base: bruto.base ?? "http://localhost:3000",
    slug: bruto.slug ?? "carga-fatia-1",
    clientes: Number(bruto.clientes ?? 200),
    midias: Number(bruto.midias ?? 4000),
    escala: Number(bruto.escala ?? 120),
    sondagem: Number(bruto.sondagem ?? 30),
    feed: Number(bruto.feed ?? 6000),
    manter: bruto.manter === "true",
  }
}

/**
 * O relogio de todas as medidas.
 *
 * Guarda TODAS as amostras, e nao so a soma: **mediana e p90 sao o que a H-21
 * pede**, e media esconde exatamente o caso que interessa. Numa festa, a media
 * de 4.000 envios bons e 40 catastroficos e boa.
 */
function medidor(nome) {
  const amostras = []
  let erros = 0
  return {
    nome,
    async medir(fn) {
      const inicio = performance.now()
      try {
        const saida = await fn()
        amostras.push(performance.now() - inicio)
        return saida
      } catch (falha) {
        erros += 1
        throw falha
      }
    },
    registrar(ms) {
      amostras.push(ms)
    },
    contarErro() {
      erros += 1
    },
    resumo() {
      const ordenadas = [...amostras].sort((a, b) => a - b)
      const q = f =>
        ordenadas.length === 0
          ? null
          : ordenadas[Math.min(ordenadas.length - 1, Math.floor(ordenadas.length * f))]
      return {
        nome,
        amostras: ordenadas.length,
        erros,
        p50: q(0.5),
        p90: q(0.9),
        p99: q(0.99),
        maximo: ordenadas.at(-1) ?? null,
      }
    },
  }
}

const dormir = ms => new Promise(r => setTimeout(r, ms))
const uuid = () => crypto.randomUUID()

/* ------------------------------------------------------------------ *
 * O cliente simulado — um aparelho
 * ------------------------------------------------------------------ */

/**
 * Um convidado. Ele guarda os proprios cookies, como um navegador guarda.
 *
 * O `fetch` do Node nao tem jarra de cookie: sem esta classe, os 200 clientes
 * compartilhariam sessao nenhuma e o teste mediria 200 anonimos levando 403 —
 * verde, rapido, e sobre nada.
 */
class Aparelho {
  constructor(base, indice) {
    this.base = base
    this.indice = indice
    this.cookies = new Map()
    this.eventoId = null
  }

  cabecalhoDeCookie() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ")
  }

  guardarCookies(resposta) {
    const cru = resposta.headers.getSetCookie?.() ?? []
    for (const linha of cru) {
      const [par] = linha.split(";")
      const [nome, ...resto] = par.split("=")
      this.cookies.set(nome.trim(), resto.join("=").trim())
    }
  }

  async pedir(caminho, opcoes = {}) {
    const resposta = await fetch(`${this.base}${caminho}`, {
      ...opcoes,
      redirect: "manual",
      headers: {
        ...(opcoes.headers ?? {}),
        ...(this.cookies.size ? { cookie: this.cabecalhoDeCookie() } : {}),
      },
    })
    this.guardarCookies(resposta)
    return resposta
  }

  /**
   * Diz quem e — o degrau que da NUMERADOR a P.
   *
   * Sem ele, `vw_participacao_evento` conta zero: a view soma
   * `count(distinct convidado_id)`, e participacao sem `convidado_id` nao entra.
   * E o certo — convidado que nao se identificou nao e contavel —, mas um teste
   * de carga que nao identifica ninguem mediria a North Star como zero e nao
   * exercitaria a rota da H-09.
   */
  async dizerQuemE(eventoId, convidado) {
    const r = await this.pedir(`/api/eventos/${eventoId}/participacoes/atual`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modo_identificacao: "lista",
        convidado_id: convidado.id,
        rotulo: convidado.nome,
      }),
    })
    if (!r.ok) throw new Error(`identificacao ${r.status}`)
  }

  /** Le o QR: rota curta com `?o=mesa`, e o 307 para o album. */
  async lerOQr(slug) {
    const curta = await this.pedir(`/${slug}?o=mesa`)
    if (curta.status !== 307) {
      throw new Error(`rota curta respondeu ${curta.status}, esperado 307`)
    }
    const destino = curta.headers.get("location")
    const album = await this.pedir(new URL(destino, this.base).pathname + "?o=mesa")
    if (!album.ok) throw new Error(`album respondeu ${album.status}`)
    return album
  }
}

/* ------------------------------------------------------------------ *
 * A preparacao — o evento e os 200 aparelhos
 * ------------------------------------------------------------------ */

/**
 * **A DATA DO EVENTO E ONTEM, E NAO HOJE** — e a primeira coisa que este teste
 * ensinou, na primeira rodada.
 *
 * A janela de MEDICAO comeca as 12:00 do dia do evento, no fuso do evento
 * (metricas.md §1.1) e vai ate 48 h depois. Um teste rodado de manha, com a data
 * de hoje, poe todas as midias ANTES da janela — e a participacao sai ZERO, sem
 * nenhum erro em lugar nenhum. O numero estaria certo; o teste e que estava
 * errado. Com ontem, a janela ja abriu e o agora esta dentro dela.
 */
async function prepararEvento() {
  const [existente] = await sql`select id from eventos where slug = ${opcoes.slug}`
  if (existente) {
    await sql`delete from eventos where id = ${existente.id}`
  }
  const [evento] = await sql`
    insert into eventos
      (slug, nome_casal, data_evento, fuso, cidade, uf, publicado,
       envio_abre_em, envio_fecha_em, inicio_festa_em, fim_festa_em, presentes_contagem)
    values
      (${opcoes.slug}, 'Carga Fatia 1', current_date - 1, 'America/Sao_Paulo',
       'Rio de Janeiro', 'RJ', true,
       now() - interval '1 day', now() + interval '7 days',
       now() - interval '2 hours', now() + interval '6 hours', 184)
    returning id
  `
  return String(evento.id)
}

/** A lista de convidados: o denominador da North Star. */
async function semearConvidados(eventoId, quantos) {
  const nomes = Array.from({ length: quantos }, (_, i) => `Convidado ${i + 1}`)
  await sql`
    insert into convidados (evento_id, nome, pessoas_no_slot, ordem)
    select ${eventoId}::uuid, nome, 1, ordinality
      from unnest(${nomes}::text[]) with ordinality as t(nome, ordinality)
  `
}

/* ------------------------------------------------------------------ *
 * Fase 1 — a chegada das fotos
 * ------------------------------------------------------------------ */

/**
 * A DISTRIBUICAO DA NOITE (criterio da H-21): 6 horas, com **dois picos de 30%
 * do volume em 20 minutos**.
 *
 * Os picos nao sao enfeite: eles sao a festa. O primeiro e a entrada da noiva, o
 * segundo e a valsa — dois momentos em que 200 pessoas levantam o celular ao
 * mesmo tempo. Uma distribuicao uniforme mediria um produto que ninguem usa.
 */
function agenda(total, duracaoSegundos) {
  const instantes = []
  const pico1 = duracaoSegundos * 0.25
  const pico2 = duracaoSegundos * 0.7
  const janelaDoPico = (20 / 360) * duracaoSegundos

  const noPico = Math.round(total * 0.3)
  for (let i = 0; i < noPico; i++) {
    instantes.push(pico1 + Math.random() * janelaDoPico)
  }
  for (let i = 0; i < noPico; i++) {
    instantes.push(pico2 + Math.random() * janelaDoPico)
  }
  for (let i = instantes.length; i < total; i++) {
    instantes.push(Math.random() * duracaoSegundos)
  }
  return instantes.sort((a, b) => a - b)
}

async function faseDaChegada(aparelhos, eventoId) {
  const duracao = (6 * 3600) / opcoes.escala
  const instantes = agenda(opcoes.midias, duracao)

  const daIntencao = medidor("POST /midias/intencao")
  const daConfirmacao = medidor("POST /midias/[id]/confirmacao")
  const doProduto = medidor("custo do produto no seconds_since_scan")

  console.log(
    `\nFase 1 — chegada: ${opcoes.midias} fotos em ${duracao.toFixed(0)} s ` +
      `(6 h comprimidas ${opcoes.escala}x), com dois picos de 30% em 20 min.`
  )

  const inicio = performance.now()
  const emVoo = []

  for (const [posicao, quando] of instantes.entries()) {
    const atraso = quando * 1000 - (performance.now() - inicio)
    if (atraso > 0) await dormir(Math.min(atraso, 250))

    const aparelho = aparelhos[posicao % aparelhos.length]
    emVoo.push(
      (async () => {
        const t0 = performance.now()
        try {
          const clientMediaId = uuid()
          const corpo = await daIntencao.medir(async () => {
            const r = await aparelho.pedir(`/api/eventos/${eventoId}/midias/intencao`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                itens: [
                  {
                    client_media_id: clientMediaId,
                    lote_id: uuid(),
                    bytes: 3_500_000,
                    tipo_arquivo: "image/jpeg",
                    // 30% escolhem "so para os noivos" — a hipotese S1.
                    visibilidade: Math.random() < 0.3 ? "noivos" : "feed",
                    origem: "camera",
                    enfileirada_offline: false,
                  },
                ],
              }),
            })
            if (!r.ok) throw new Error(`intencao ${r.status}`)
            return r.json()
          })

          const midiaId = corpo.itens[0].midia_id

          await daConfirmacao.medir(async () => {
            const r = await aparelho.pedir(
              `/api/eventos/${eventoId}/midias/${midiaId}/confirmacao`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  faixa: "previa",
                  bytes_previa: 240_000,
                  largura: 1600,
                  altura: 1200,
                }),
              }
            )
            if (!r.ok) throw new Error(`confirmacao ${r.status}`)
          })

          doProduto.registrar(performance.now() - t0)

          // 60% completam o original — a segunda faixa, que e qualidade e nao perda.
          if (Math.random() < 0.6) {
            await aparelho.pedir(
              `/api/eventos/${eventoId}/midias/${midiaId}/confirmacao`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ faixa: "original" }),
              }
            )
          }
        } catch {
          doProduto.contarErro()
        }
      })()
    )

    if (emVoo.length >= 400) {
      await Promise.all(emVoo.splice(0))
    }
  }
  await Promise.all(emVoo)

  return [daIntencao.resumo(), daConfirmacao.resumo(), doProduto.resumo()]
}

/* ------------------------------------------------------------------ *
 * Fase 2 — a sondagem: 200 clientes a cada 5 s = 40 req/s
 * ------------------------------------------------------------------ */

async function faseDaSondagem(aparelhos, eventoId) {
  const daSondagem = medidor("GET /feed/novidades")
  const alvo = Math.round(opcoes.clientes / 5)
  console.log(
    `\nFase 2 — sondagem: ${alvo} req/s por ${opcoes.sondagem} s ` +
      `(${opcoes.clientes} clientes perguntando a cada 5 s).`
  )

  const fim = performance.now() + opcoes.sondagem * 1000
  let disparadas = 0
  const emVoo = []

  while (performance.now() < fim) {
    const rodada = performance.now()
    for (let i = 0; i < alvo; i++) {
      const aparelho = aparelhos[(disparadas + i) % aparelhos.length]
      emVoo.push(
        daSondagem
          .medir(async () => {
            const r = await aparelho.pedir(`/api/eventos/${eventoId}/feed/novidades`)
            if (!r.ok) throw new Error(String(r.status))
            return r.json()
          })
          .catch(() => {})
      )
    }
    disparadas += alvo
    if (emVoo.length > 2000) await Promise.all(emVoo.splice(0))
    const gasto = performance.now() - rodada
    if (gasto < 1000) await dormir(1000 - gasto)
  }
  await Promise.all(emVoo)

  return [daSondagem.resumo(), { disparadas, segundos: opcoes.sondagem }]
}

/* ------------------------------------------------------------------ *
 * Fase 3 — abrir o album com N itens
 * ------------------------------------------------------------------ */

/**
 * O teto da H-11: **abrir o album com 6.000 itens em menos de 3 s.**
 *
 * Semeia direto no banco (o caminho pelo HTTP levaria horas e mediria outra
 * coisa) e depois mede a rota de verdade: primeira pagina, e a rolagem por
 * cursor ate o fim.
 */
async function faseDoAlbumGrande(aparelhos, eventoId) {
  console.log(`\nFase 3 — album com ${opcoes.feed} itens.`)

  const [{ atual }] = await sql`
    select count(*)::int as atual from midias
     where evento_id = ${eventoId}::uuid and estado = 'armazenada'
  `
  const faltam = Math.max(0, opcoes.feed - Number(atual))
  if (faltam > 0) {
    const [participacao] = await sql`
      select id from participacoes where evento_id = ${eventoId}::uuid limit 1
    `
    const LOTE = 500
    for (let feitas = 0; feitas < faltam; feitas += LOTE) {
      const quantas = Math.min(LOTE, faltam - feitas)
      await sql`
        insert into midias
          (evento_id, participacao_id, lote_id, client_media_id, estado, visibilidade,
           aprovacao, tipo_arquivo, bytes, largura, altura,
           criada_em, previa_armazenada_em, armazenada_em, original_armazenada_em)
        select ${eventoId}::uuid, ${participacao.id}::uuid,
               gen_random_uuid(), gen_random_uuid(), 'armazenada', 'feed',
               'nao_requer', 'image/jpeg', 3500000, 1600, 1200,
               now() - (i * interval '1 second'),
               now() - (i * interval '1 second'),
               now() - (i * interval '1 second'),
               now() - (i * interval '1 second')
          from generate_series(1, ${quantas}) as i
      `
    }
  }

  const aparelho = aparelhos[0]
  const primeira = medidor("GET /feed (primeira pagina)")
  const rolagem = medidor("GET /feed (paginas seguintes)")

  let bytes = 0
  let itens = 0
  let paginas = 0

  const corpo = await primeira.medir(async () => {
    const r = await aparelho.pedir(`/api/eventos/${eventoId}/feed`)
    const texto = await r.text()
    bytes += texto.length
    return JSON.parse(texto)
  })
  itens += corpo.itens.length
  paginas += 1

  let cursor = corpo.cursor
  while (cursor) {
    const pagina = await rolagem.medir(async () => {
      const r = await aparelho.pedir(
        `/api/eventos/${eventoId}/feed?cursor=${encodeURIComponent(cursor)}`
      )
      const texto = await r.text()
      bytes += texto.length
      return JSON.parse(texto)
    })
    itens += pagina.itens.length
    paginas += 1
    cursor = pagina.cursor
    if (paginas > 400) break
  }

  return [
    primeira.resumo(),
    rolagem.resumo(),
    { itens, paginas, bytesTotais: bytes, bytesPorItem: Math.round(bytes / Math.max(1, itens)) },
  ]
}

/* ------------------------------------------------------------------ *
 * Fase 4 — o painel e a fila, com a festa cheia
 * ------------------------------------------------------------------ */

async function faseDoPainel(eventoId) {
  console.log("\nFase 4 — painel do dono e fila de aprovacao.")
  const daMedicao = medidor("consulta das sete linhas (SQL direto)")

  for (let i = 0; i < 20; i++) {
    await daMedicao.medir(async () => {
      await sql`select * from vw_participacao_evento where evento_id = ${eventoId}::uuid`
      await sql`
        select count(*)::int as pendentes,
               extract(epoch from (now() - min(armazenada_em))) / 60 as idade
          from midias
         where evento_id = ${eventoId}::uuid and estado = 'armazenada'
           and visibilidade = 'feed' and aprovacao = 'pendente' and excluida_em is null
      `
      await sql`
        select count(*) filter (where visibilidade = 'feed')::int as feed,
               count(*) filter (where visibilidade_alterada)::int as mexeram
          from midias where evento_id = ${eventoId}::uuid and estado = 'armazenada'
      `
    })
  }

  return [daMedicao.resumo()]
}

/* ------------------------------------------------------------------ *
 * Fase 5 — o veredito
 * ------------------------------------------------------------------ */

async function faseDoVeredito(eventoId) {
  const [contagens] = await sql`
    select
      (select count(*)::int from midias where evento_id = ${eventoId}::uuid) as total,
      (select count(*)::int from midias
        where evento_id = ${eventoId}::uuid and previa_armazenada_em is not null) as armazenadas,
      (select count(*)::int from midias
        where evento_id = ${eventoId}::uuid and estado = 'intencao') as sem_previa,
      (select count(*)::int from midias
        where evento_id = ${eventoId}::uuid
          and previa_armazenada_em is not null and original_armazenada_em is null) as originais_pendentes,
      (select midias_armazenadas from evento_contadores where evento_id = ${eventoId}::uuid) as contador
  `
  const erros = await sql`
    select coalesce(tipo_erro, 'sem_tipo') as tipo, count(*)::int as quantos
      from eventos_de_erro where evento_id = ${eventoId}::uuid
     group by 1 order by 2 desc
  `
  /**
   * As mensagens, e nao so a contagem. "231 erros de servidor" nao diz o que
   * quebrou; a classe e a mensagem dizem — e e isso que decide se a correcao e
   * indice, pool de conexao ou fila.
   */
  const causas = await sql`
    select classe, left(mensagem, 120) as mensagem, count(*)::int as quantos
      from eventos_de_erro where evento_id = ${eventoId}::uuid
     group by 1, 2 order by 3 desc limit 8
  `
  const [perda] = await sql`
    select coalesce((select previas_perdidas from vw_perda_evento
                      where evento_id = ${eventoId}::uuid), 0)::int as previas_perdidas
  `
  const [participacao] = await sql`
    select * from vw_participacao_evento where evento_id = ${eventoId}::uuid
  `
  return { contagens, erros, causas, perda, participacao }
}

/* ------------------------------------------------------------------ *
 * Principal
 * ------------------------------------------------------------------ */

function linha(resumo) {
  const ms = v => (v === null ? "—" : `${v.toFixed(0)} ms`)
  return (
    `  ${resumo.nome.padEnd(44)} n=${String(resumo.amostras).padStart(6)}  ` +
    `p50=${ms(resumo.p50).padStart(9)}  p90=${ms(resumo.p90).padStart(9)}  ` +
    `p99=${ms(resumo.p99).padStart(9)}  max=${ms(resumo.maximo).padStart(9)}  erros=${resumo.erros}`
  )
}

async function principal() {
  console.log(`Teste de carga — ${opcoes.clientes} clientes contra ${opcoes.base}`)

  const eventoId = await prepararEvento()
  await semearConvidados(eventoId, 184)
  console.log(`Evento ${eventoId} (${opcoes.slug}) criado.`)

  console.log(`\nFase 0 — ${opcoes.clientes} aparelhos lendo o QR e dizendo quem sao.`)
  const listaDeConvidados = await sql`
    select id, nome from convidados where evento_id = ${eventoId}::uuid order by ordem
  `
  const aparelhos = []
  const doQr = medidor("GET /<slug> + /e/<slug>/album (leitura do QR)")
  const daIdentificacao = medidor("PATCH /participacoes/atual (quem eu sou)")
  for (let i = 0; i < opcoes.clientes; i += 25) {
    await Promise.all(
      Array.from({ length: Math.min(25, opcoes.clientes - i) }, async (_, j) => {
        const indice = i + j
        const aparelho = new Aparelho(opcoes.base, indice)
        try {
          await doQr.medir(() => aparelho.lerOQr(opcoes.slug))
          const convidado = listaDeConvidados[indice % listaDeConvidados.length]
          await daIdentificacao.medir(() =>
            aparelho.dizerQuemE(eventoId, {
              id: String(convidado.id),
              nome: String(convidado.nome),
            })
          )
          aparelho.eventoId = eventoId
          aparelhos.push(aparelho)
        } catch (falha) {
          doQr.contarErro()
          if (indice === 0) console.error("  primeiro cliente falhou:", falha.message)
        }
      })
    )
  }
  console.log(`  ${aparelhos.length} de ${opcoes.clientes} aparelhos com participacao.`)
  if (aparelhos.length === 0) {
    console.error("Nenhum aparelho conseguiu participacao. O servidor esta no ar?")
    process.exit(1)
  }

  const resumos = [doQr.resumo(), daIdentificacao.resumo()]
  resumos.push(...(await faseDaChegada(aparelhos, eventoId)))
  const [sondagem, volume] = await faseDaSondagem(aparelhos, eventoId)
  resumos.push(sondagem)
  const [primeira, rolagem, album] = await faseDoAlbumGrande(aparelhos, eventoId)
  resumos.push(primeira, rolagem)
  resumos.push(...(await faseDoPainel(eventoId)))
  const veredito = await faseDoVeredito(eventoId)

  console.log("\n─────────────────────────────────────────────────────────────")
  console.log("RESULTADO\n")
  for (const resumo of resumos) console.log(linha(resumo))

  console.log("\nSondagem:", JSON.stringify(volume))
  console.log("Album:   ", JSON.stringify(album))
  console.log("Contagens:", JSON.stringify(veredito.contagens))
  console.log("Erros:   ", JSON.stringify(veredito.erros))
  console.log("Causas:  ", JSON.stringify(veredito.causas, null, 2))
  console.log("Perda:   ", JSON.stringify(veredito.perda))
  console.log("P:       ", JSON.stringify(veredito.participacao))

  const saida = {
    quando: new Date().toISOString(),
    opcoes,
    resumos,
    volume,
    album,
    veredito,
  }
  const arquivo = path.join(RAIZ, "docs", "carga-fatia-1.json")
  fs.writeFileSync(arquivo, JSON.stringify(saida, null, 2))
  console.log(`\nBruto em ${path.relative(RAIZ, arquivo)}`)

  if (!opcoes.manter) {
    await sql`delete from eventos where id = ${eventoId}`
    console.log("Evento de carga removido.")
  } else {
    console.log(`Evento mantido: ${eventoId}`)
  }
}

principal().catch(falha => {
  console.error(falha)
  process.exit(1)
})
