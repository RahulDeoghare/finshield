/* Shared result renderer — turns the detector's analyze() output into HTML.
   Used by the popup now, and reused by the page overlay in Phase 2 so the
   verdict UI never forks. Mirrors the PWA's renderResult(), as a string. */

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* merge overlapping highlight ranges, keeping the highest severity */
function mergeHighlights(ranges) {
  const rank = { low: 0, medium: 1, high: 2 };
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      if (rank[r.severity] > rank[last.severity]) last.severity = r.severity;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

function highlightedHtml(text, ranges) {
  const merged = mergeHighlights(ranges);
  let html = '';
  let pos = 0;
  for (const r of merged) {
    html += escapeHtml(text.slice(pos, r.start));
    html += `<mark class="m-${r.severity}">${escapeHtml(text.slice(r.start, r.end))}</mark>`;
    pos = r.end;
  }
  html += escapeHtml(text.slice(pos));
  return html;
}

/* analyze() result -> HTML string for the result container */
export function resultToHtml(result) {
  const { score, verdict, findings, urls, positives, highlights, text } = result;
  const lvl = verdict.level;

  let html = `
    <div class="card verdict v-${lvl}">
      <div class="ring v-${lvl}" style="--p:${score}"><b>${score}</b><small>/100</small></div>
      <div class="verdict-body">
        <span class="badge v-${lvl}">${escapeHtml(verdict.label)}</span>
        <p class="blurb">${escapeHtml(verdict.blurb)}</p>
      </div>
    </div>`;

  if (positives.length) {
    html += `<div class="positives">${
      positives.map((p) => `<p>✓ ${escapeHtml(p)}</p>`).join('')
    }</div>`;
  }

  const showPreview = highlights.length > 0 && text.length > 12;
  if (showPreview) {
    html += `
      <div class="card preview">
        <div class="preview-label">Scanned text</div>
        <div class="preview-text">${highlightedHtml(text, highlights)}</div>
      </div>`;
  }

  if (urls.length) {
    html += urls.map((u) => `
      <div class="card url">
        <p class="url-host">🔗 ${escapeHtml(u.host)}</p>
        <p class="url-domain">registered domain: ${escapeHtml(u.domain)}</p>
        <span class="url-status ${u.findings.length ? 'bad' : 'ok'}">${
          u.findings.length
            ? `⚠ ${u.findings.length} red flag${u.findings.length > 1 ? 's' : ''} in this link`
            : u.trusted ? '✓ Matches a known official domain'
            : '✓ No obvious red flags in this link'
        }</span>
      </div>`).join('');
  }

  if (findings.length) {
    html += `
      <div class="card findings-card">
        <div class="findings-head"><h3>What we found</h3><span class="count">${findings.length}</span></div>
        <ul class="findings">${
          findings.map((f) => `
            <li class="finding f-${f.severity}">
              <div class="finding-head"><span class="sev">${f.severity}</span>${escapeHtml(f.title)}</div>
              <p class="finding-detail">${escapeHtml(f.detail)}</p>
              ${f.evidence ? `<span class="finding-evidence">${escapeHtml(f.evidence)}</span>` : ''}
            </li>`).join('')
        }</ul>
      </div>`;
  }

  if (lvl === 'high') {
    html += `
      <div class="card next-steps">
        <h3>Do this now</h3>
        <ul>
          <li>Don't click any links, pay, or share an OTP, PIN, or CVV.</li>
          <li>Verify only through the official app or the number printed on your card.</li>
          <li>Block and report the sender.</li>
        </ul>
      </div>`;
  }

  return html;
}
