# ADR 0005 — REJEITADO e substituído

**Este arquivo é uma lápide, e ela fica.**

A primeira redação do ADR 0005 ("A mídia é lida por uma base pública, e não por
URL assinada") decidiu servir **toda** a mídia por um domínio público e declarou,
de olhos abertos, que *"quem tiver a URL exata de uma foto a vê sem sessão —
inclusive uma foto `noivos`"*.

**A decisão foi rejeitada em 19/08/2026, no mesmo dia em que foi escrita.** O
motivo, em uma frase: o produto imprime na tela **"Só os noivos veem esta foto"**,
e a razão entre os dois botões de envio é a hipótese central que a Fatia 1 existe
para medir. Uma promessa que depende de ninguém descobrir a URL é falsa por
construção, e mediríamos uma escolha cuja consequência o produto não cumpre.

**A decisão que vale está em [`0005-dois-prefixos-no-balde.md`](./0005-dois-prefixos-no-balde.md)**,
e ela virou regra de negócio (RN-33): o balde tem dois prefixos, `pub/` é servido
e `prv/` não, e uma foto que muda de `feed` para `noivos` **muda de prefixo** —
com a troca só sendo confirmada depois de o endereço antigo parar de responder,
inclusive na borda.

**Por que este arquivo não foi apagado.** O ADR anterior contém a aritmética que
sustenta a metade que sobreviveu — por que a mídia `feed` continua sendo servida
por endereço público, e por que assinar cada `GET` numa rota nossa era inviável
com 6.000 miniaturas. Apagar o registro deixaria a próxima pessoa refazendo a
conta e, pior, sem saber que a saída óbvia já foi tentada e recusada.
