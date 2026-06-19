/* FinShield adapter — WhatsApp Web (web.whatsapp.com).
   Scans incoming message bubbles and tags risky ones with an inline chip.
   Selectors are best-effort against WhatsApp's obfuscated DOM; if they match
   nothing the adapter simply does nothing and never breaks the page. */

FinShieldAdapter.init({
  host: 'whatsapp',

  // the open conversation pane; falls back to body until it mounts
  root: () => document.querySelector('#main') || document.querySelector('#app') || null,

  // incoming bubbles (real scams arrive here) + outgoing (covers forwarding a
  // message to check it, and the "message yourself" test flow). Normal chat
  // scores well below the threshold, so your own messages won't get chips.
  messageSelector: 'div.message-in, div.message-out',

  extractText: (node) => {
    const span = node.querySelector('.copyable-text .selectable-text, span.selectable-text');
    const body = span ? span.innerText : node.innerText;
    // include any link hrefs so the engine's URL rules can see them too
    const links = [...node.querySelectorAll('a[href]')]
      .map((a) => a.href).filter((h) => /^https?:/i.test(h)).slice(0, 50);
    return links.length ? `${body}\n${links.join('\n')}` : body;
  },

  attachBadge: (node, chip) => {
    // sit the chip at the end of the bubble's text
    const target = node.querySelector('.copyable-text') || node;
    target.appendChild(chip);
  },
});
