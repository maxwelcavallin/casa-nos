import Script from "next/script";

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
 */
export function GoogleAnalytics({ eventoId }: { eventoId: string }) {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!id) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-config" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${id}', { wedding_id: '${eventoId}' });
        `}
      </Script>
    </>
  );
}

export default GoogleAnalytics;
