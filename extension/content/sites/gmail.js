/* FinShield adapter — Gmail (mail.google.com).
   Scans each opened email body and tags risky ones with an inline chip at the
   top of the message. Selectors are best-effort against Gmail's DOM; if they
   match nothing the adapter does nothing and never breaks the page. */

FinShieldAdapter.init({
  host: 'gmail',

  root: () => document.querySelector('div[role="main"]') || null,

  // .a3s is the rendered email body of an opened message
  messageSelector: 'div.a3s',

  extractText: (node) => {
    // prepend the conversation subject for context, if present
    const subject = document.querySelector('h2.hP')?.innerText || '';
    const links = [...node.querySelectorAll('a[href]')]
      .map((a) => a.href).filter((h) => /^https?:/i.test(h)).slice(0, 100);
    return [subject, node.innerText, links.join('\n')].filter(Boolean).join('\n');
  },

  attachBadge: (node, chip) => {
    chip.style.marginBottom = '8px';
    // float the chip onto its own line above the email body
    const line = document.createElement('div');
    line.setAttribute('data-finshield-chip', '1');
    line.appendChild(chip);
    node.insertBefore(line, node.firstChild);
  },
});
