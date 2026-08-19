"use client";

import { useEffect } from "react";

/**
 * Registra o service worker da casca (H-05).
 *
 * SÓ NO ÁLBUM, e não no site inteiro: a página pública do casamento é aberta uma
 * vez, de relance, num link de WhatsApp — instalar um trabalhador de segundo
 * plano no navegador de quem só quer ver a data é custo sem contrapartida. O
 * álbum é outra coisa: é a tela que a pessoa reabre no meio da festa, com a rede
 * caindo, e é ali que a casca guardada vale.
 *
 * FALHA EM SILÊNCIO, de propósito. Navegador em janela anônima recusa o
 * registro; navegador antigo não tem `serviceWorker`. Nos dois casos o produto
 * continua funcionando com rede — o que se perde é a segunda visita offline, e
 * não a primeira.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // `void`: o registro não bloqueia nada e não tem o que fazer com o
    // resultado. O que importa é que ele aconteça depois da primeira pintura.
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
