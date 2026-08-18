"use client";

import Script from "next/script";
import { useEffect } from "react";

import { configurarAnalytics } from "@/lib/analytics";

/**
 * Carrega o GA4, ou não carrega nada.
 *
 * `NEXT_PUBLIC_GA_MEASUREMENT_ID` vazio devolve `null`: nenhum script, nenhuma
 * requisição a domínio de terceiro, nenhum cookie. É o estado do projeto até o
 * dono criar a propriedade — e é melhor que um id inventado, que mandaria os
 * dados deste casamento para a propriedade de outra pessoa.
 *
 * `strategy="afterInteractive"` porque medição não pode atrasar a primeira
 * pintura: o convidado chega de link de WhatsApp, no 4G do ônibus, e a página é
 * a promessa do produto inteiro.
 *
 * POR QUE O `config` SAIU DAQUI. Ele era um `<Script>` embutido — uma string de
 * JavaScript montada com template. Uma string não passa pelo `tsc`, não passa
 * pelo lint e não dá para testar, e foi exatamente ali que a URL real do
 * casamento saiu para o Google em todo `page_view` por não estar escrito
 * nenhum `page_location`. Agora o comando mora em `lib/analytics.ts`, que é
 * código de verdade, com o mascaramento junto e com teste em cima.
 *
 * `referrerPolicy="no-referrer"` neste `<script>`, além do cabeçalho global:
 * sem ele o navegador anuncia `Referer: https://<dominio-do-casal>/e/ana-e-max`
 * ao buscar o `gtag.js`. Mascarar o `page_location` e deixar o cabeçalho de
 * lado teria trocado o vazamento de lugar, não fechado.
 */
export function GoogleAnalytics({ eventoId }: { eventoId: string }) {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  useEffect(() => {
    if (!id) return;
    // A ordem com o `gtag.js` não importa: os comandos são empilhados no
    // `dataLayer` e processados na ordem em que entraram, tenha o script
    // carregado antes ou depois.
    configurarAnalytics(id, eventoId);
  }, [id, eventoId]);

  if (!id) return null;

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
      strategy="afterInteractive"
      referrerPolicy="no-referrer"
    />
  );
}

export default GoogleAnalytics;
