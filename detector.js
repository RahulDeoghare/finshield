/* FinShield — on-device scam detection engine.
   Everything runs locally; no text ever leaves the device. */

// ---------------------------------------------------------------- constants

const TRUSTED_DOMAINS = new Set([
  // Indian banks / payments
  'onlinesbi.sbi', 'sbi.co.in', 'onlinesbi.com', 'hdfcbank.com', 'hdfc.com',
  'icicibank.com', 'axisbank.com', 'kotak.com', 'pnbindia.in', 'bankofbaroda.in',
  'unionbankofindia.co.in', 'idfcfirstbank.com', 'indusind.com', 'yesbank.in',
  'paytm.com', 'paytmbank.com', 'phonepe.com', 'bhimupi.org.in', 'npci.org.in',
  'razorpay.com', 'rbi.org.in', 'incometax.gov.in', 'sebi.gov.in', 'cred.club',
  // Global banks / payments
  'paypal.com', 'stripe.com', 'wise.com', 'revolut.com', 'venmo.com',
  'cash.app', 'zellepay.com', 'chase.com', 'bankofamerica.com',
  'wellsfargo.com', 'citi.com', 'citibank.com', 'hsbc.com', 'barclays.co.uk',
  'visa.com', 'mastercard.com', 'americanexpress.com', 'irs.gov',
  'google.com', 'apple.com', 'amazon.com', 'amazon.in',
]);

const BRANDS = [
  { name: 'paypal',   official: ['paypal.com'] },
  { name: 'paytm',    official: ['paytm.com', 'paytmbank.com'] },
  { name: 'phonepe',  official: ['phonepe.com'] },
  { name: 'gpay',     official: ['google.com'] },
  { name: 'googlepay',official: ['google.com'] },
  { name: 'sbi',      official: ['onlinesbi.sbi', 'sbi.co.in', 'onlinesbi.com'] },
  { name: 'hdfc',     official: ['hdfcbank.com', 'hdfc.com'] },
  { name: 'icici',    official: ['icicibank.com'] },
  { name: 'axis',     official: ['axisbank.com'] },
  { name: 'kotak',    official: ['kotak.com'] },
  { name: 'pnb',      official: ['pnbindia.in'] },
  { name: 'barclays', official: ['barclays.co.uk'] },
  { name: 'chase',    official: ['chase.com'] },
  { name: 'citibank', official: ['citi.com', 'citibank.com'] },
  { name: 'wellsfargo', official: ['wellsfargo.com'] },
  { name: 'hsbc',     official: ['hsbc.com'] },
  { name: 'venmo',    official: ['venmo.com'] },
  { name: 'zelle',    official: ['zellepay.com'] },
  { name: 'cashapp',  official: ['cash.app'] },
  { name: 'revolut',  official: ['revolut.com'] },
  { name: 'stripe',   official: ['stripe.com'] },
  { name: 'razorpay', official: ['razorpay.com'] },
  { name: 'netbanking', official: [] },
  { name: 'amazon',   official: ['amazon.com', 'amazon.in'] },
  { name: 'rbi',      official: ['rbi.org.in'] },
  { name: 'whatsapp', official: ['whatsapp.com', 'wa.me'] },
];

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy',
  'tiny.cc', 'rebrand.ly', 'shorturl.at', 's.id', 'ow.ly', 'buff.ly',
  't.ly', 'v.gd', 'qr.ae', 'lnkd.in', 'bl.ink', 'short.io', 'u.to',
]);

const RISKY_TLDS = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'buzz', 'click', 'work',
  'loan', 'men', 'icu', 'cam', 'rest', 'zip', 'mov', 'stream', 'download',
  'racing', 'bid', 'win', 'vip', 'monster', 'quest', 'sbs', 'cfd', 'cyou',
  'lol', 'pw', 'gdn', 'date', 'review', 'country', 'accountant', 'science',
]);

const KNOWN_TLDS = new Set([
  'com', 'net', 'org', 'in', 'co', 'io', 'me', 'app', 'dev', 'info', 'biz',
  'online', 'site', 'shop', 'club', 'live', 'link', 'ly', 'gd', 'cc', 'to',
  'gl', 'at', 'sg', 'uk', 'us', 'ca', 'au', 'br', 'ru', 'cn', 'de', 'fr',
  'jp', 'sbi', 'bank', 'gov', 'edu', 'ai', 'id', 'ph', 'pk', 'bd', 'np',
  ...RISKY_TLDS,
]);

const TWO_PART_SUFFIXES = new Set([
  'co.in', 'co.uk', 'co.nz', 'co.za', 'co.jp', 'co.id', 'co.ke', 'co.th',
  'co.kr', 'com.au', 'com.br', 'com.mx', 'com.sg', 'com.my', 'com.ph',
  'com.tr', 'com.ar', 'com.bd', 'com.pk', 'com.np', 'com.ng', 'com.hk',
  'com.cn', 'com.tw', 'org.in', 'net.in', 'gov.in', 'ac.in', 'edu.in',
  'org.uk', 'gov.uk', 'org.au', 'net.au',
]);

const SENSITIVE_DOMAIN_WORDS = [
  'secure', 'verify', 'login', 'signin', 'update', 'account', 'kyc',
  'refund', 'bonus', 'wallet', 'support', 'helpdesk', 'reward', 'unlock',
  'confirm', 'official', 'alert', 'banking',
];

// ---------------------------------------------------------------- text rules

const TEXT_RULES = [
  {
    id: 'asks-credentials', points: 35, severity: 'high',
    re: /\b(?:share|send|enter|confirm|verify|provide|tell|submit|give|update)\b[^.!?\n]{0,60}?\b(?:otp|one[- ]?time\s?(?:password|pin|code)|cvv|atm\s?pin|upi\s?pin|m-?pin|password|passcode|card\s?number|account\s?number|aadhaa?r|pan\s?(?:card|number)|net\s?banking)\b|\b(?:otp|cvv|upi\s?pin|m-?pin)\b[^.!?\n]{0,40}?\b(?:share|send|bhejo|batao|enter|confirm)\b/gi,
    title: 'Asks for OTP, PIN, or card details',
    detail: 'No bank, wallet, or government agency ever asks you to share an OTP, PIN, CVV, or password. Anyone asking is a scammer — full stop.',
  },
  {
    id: 'account-threat', points: 22, severity: 'high',
    re: /\b(?:account|card|sim|wallet|upi|electricity|power\s?supply|connection|number)\b[^.!?\n]{0,50}?\b(?:blocked?|suspend(?:ed)?|frozen|freeze|deactivat\w+|disconnect\w+|clos(?:e|ed|ure)|terminat\w+|expir\w+)\b|\b(?:blocked?|suspend(?:ed)?)\b[^.!?\n]{0,30}\b(?:account|card|upi|wallet)\b/gi,
    title: 'Threatens to block or suspend your account',
    detail: 'Fear of losing access is the classic pressure tactic. Real banks notify you through the official app and never demand instant action over SMS or chat.',
  },
  {
    id: 'urgency', points: 15, severity: 'medium',
    re: /\b(?:immediately|urgent(?:ly)?|within\s\d+\s?(?:hours?|hrs?|minutes?|mins?)|expires?\s(?:today|soon|tonight)|last\s(?:chance|warning|day)|final\s(?:notice|warning|reminder)|act\snow|right\snow|today\sitself|turant|jaldi)\b/gi,
    title: 'Creates false urgency',
    detail: 'Scammers rush you so you act before you think. Legitimate institutions give you time and official channels to respond.',
  },
  {
    id: 'kyc-scam', points: 26, severity: 'high',
    re: /\bkyc\b[^.!?\n]{0,50}?\b(?:update|expir\w+|pending|suspend\w+|complete|verif\w+|renew\w*|block\w*)\b|\b(?:update|complete|verify|renew)\b[^.!?\n]{0,20}?\bkyc\b/gi,
    title: '"KYC update" scam pattern',
    detail: 'Fake KYC-expiry messages are one of the most common bank frauds. KYC is only ever done through your bank\'s official app, website, or branch — never via a link in a message.',
  },
  {
    id: 'lottery-prize', points: 22, severity: 'high',
    re: /\b(?:you\s(?:have\s)?won|winner|lottery|lucky\sdraw|jackpot|prize|congratulations?[^.!?\n]{0,40}(?:selected|won|chosen)|claim\s(?:your\s)?(?:reward|prize|cashback|gift)|scratch\s?card)\b/gi,
    title: 'Lottery / prize bait',
    detail: 'You can\'t win a lottery you never entered. Prize messages exist to make you pay "fees" or hand over bank details.',
  },
  {
    id: 'advance-fee', points: 25, severity: 'high',
    re: /\b(?:processing|registration|activation|handling|clearance|custom[s]?|courier|delivery|gst|tax|service|small|token|refundable)\s?(?:fee|charge|amount)s?\b|\bpay\b[^.!?\n]{0,40}?\bto\s(?:claim|receive|release|unlock|activate|get)\b/gi,
    title: 'Demands an upfront fee',
    detail: 'Asking you to pay a small fee to receive money, a prize, a parcel, or a loan is the advance-fee scam. The "fee" is the whole point — there is no payout.',
  },
  {
    id: 'loan-trap', points: 20, severity: 'high',
    re: /\b(?:instant|quick|easy|urgent|pre-?approved|guaranteed)\s?(?:personal\s)?loan\b|\bloan\b[^.!?\n]{0,50}?\b(?:no\s(?:documents?|paperwork|credit\s?(?:score|check)|cibil)|without\s(?:documents?|cibil|credit)|0%\sinterest|low\sinterest|5\smin)/gi,
    title: 'Predatory instant-loan offer',
    detail: 'Fake loan apps approve "instantly", then harvest your contacts and photos for harassment and extortion. Borrow only from RBI-registered lenders via official stores.',
  },
  {
    id: 'remote-access', points: 32, severity: 'high',
    re: /\b(?:anydesk|teamviewer|quick\s?support|rustdesk|alpemix|airdroid|screen\s?shar\w+|remote\s(?:access|control|desktop))\b/gi,
    title: 'Asks for remote access to your device',
    detail: 'Installing AnyDesk/TeamViewer for a "support agent" gives them your screen — including your banking apps and OTPs. No real bank support asks for this.',
  },
  {
    id: 'apk-sideload', points: 26, severity: 'high',
    re: /\b(?:download|install|open)\b[^.!?\n]{0,40}?\b(?:apk|\.apk|app\sfrom\s(?:this\s)?link)\b|\b\w+\.apk\b/gi,
    title: 'Pushes an APK / sideloaded app',
    detail: 'Apps sent as APK files bypass Play Store security checks. Fake banking and "support" APKs read your SMS to steal OTPs. Install apps only from official stores.',
  },
  {
    id: 'upi-collect', points: 30, severity: 'high',
    re: /\b(?:accept|approve)\b[^.!?\n]{0,40}?\b(?:request|collect)\b[^.!?\n]{0,40}?\b(?:receive|get|money|amount|payment|refund)\b|\bcollect\srequest\b|\b(?:enter|use)\b[^.!?\n]{0,30}?\bupi\spin\b[^.!?\n]{0,30}?\breceive\b/gi,
    title: '"Approve to receive money" — UPI collect fraud',
    detail: 'You NEVER need to approve a request or enter your UPI PIN to RECEIVE money. Approving a collect request sends money out of your account.',
  },
  {
    id: 'authority-pressure', points: 20, severity: 'medium',
    re: /\b(?:rbi|income\s?tax|customs?|cbi|police|cyber\s?cell|court|trai|fedex|narcotics?|digital\sarrest|arrest\swarrant|legal\saction|fir\b)\b[^.!?\n]{0,80}?\b(?:pay|fine|penalty|deposit|verify|call|case|seized?|blocked?)\b/gi,
    title: 'Impersonates police / tax / authority',
    detail: '"Digital arrest", seized-parcel, and tax-penalty calls are organized frauds. Agencies never demand payment or verification over phone, SMS, or video calls.',
  },
  {
    id: 'gift-card-crypto', points: 20, severity: 'medium',
    re: /\b(?:gift\s?cards?|google\s?play\s(?:card|code)|itunes\scard|steam\scard|bitcoin|btc|usdt|crypto(?:currency)?)\b[^.!?\n]{0,50}?\b(?:pay|send|buy|purchase|transfer|deposit)\b|\b(?:pay|send|buy)\b[^.!?\n]{0,30}?\b(?:gift\s?card|bitcoin|usdt|crypto)\b/gi,
    title: 'Demands gift cards or crypto',
    detail: 'Untraceable payment methods (gift cards, crypto) are demanded precisely because they can\'t be reversed or traced. No legitimate business collects payment this way.',
  },
  {
    id: 'too-good', points: 24, severity: 'high',
    re: /\b(?:double|triple)\s(?:your\s)?(?:money|investment)\b|\bguaranteed\s(?:returns?|profit|income)\b|\b\d{2,3}%\s(?:returns?|profit)\b|\bearn\b[^.!?\n]{0,30}?\b(?:per\s(?:day|week)|daily|from\shome)\b|\brisk[- ]?free\s(?:investment|returns?|trading)\b/gi,
    title: 'Too-good-to-be-true returns',
    detail: 'Guaranteed or outsized returns are the signature of investment and task-job scams. Real investments carry risk and never promise fixed high profits.',
  },
  {
    id: 'task-job-scam', points: 16, severity: 'medium',
    re: /\b(?:part[- ]?time\sjob|work\sfrom\shome|simple\stasks?|like\s(?:and\s)?subscribe|rate\s(?:hotels?|products?)|telegram|whats\s?app\s(?:group|job))\b[^.!?\n]{0,60}?\b(?:earn|salary|income|₹|rs\.?|\$)\b/gi,
    title: 'Task-based job scam pattern',
    detail: 'Pay-per-task "jobs" (liking videos, rating hotels) pay small amounts first, then demand deposits for "bigger tasks" — that deposit is what they steal.',
  },
  {
    id: 'refund-bait', points: 14, severity: 'medium',
    re: /\b(?:refund|cashback|reimbursement)\b[^.!?\n]{0,50}?\b(?:click|claim|link|process|initiate|pending|approve)\b/gi,
    title: 'Unsolicited refund bait',
    detail: 'Fake refund links open phishing pages or trigger UPI collect requests. Check refunds only inside the official app where you made the purchase.',
  },
  {
    id: 'generic-greeting', points: 6, severity: 'low',
    re: /\bdear\s(?:customer|user|winner|sir|madam|account\sholder|valued\s\w+)\b/gi,
    title: 'Generic greeting',
    detail: 'Your bank knows your name. Mass-blast greetings like "Dear Customer" are typical of phishing campaigns.',
  },
  {
    id: 'secrecy', points: 12, severity: 'medium',
    re: /\b(?:do\s?n[o']t\s(?:tell|inform|share\sthis\swith)\s(?:any\s?one|anybody|family|your|dad|daddy|mom|mum|mummy|papa)|keep\s(?:this\s)?(?:confidential|secret)|between\sus)\b/gi,
    title: 'Asks you to keep it secret',
    detail: 'Scammers isolate victims so nobody can warn them. Any money matter you\'re told to hide from family or your bank is a fraud.',
  },
  {
    id: 'chain-forward', points: 10, severity: 'low',
    re: /\bforward\sthis\s(?:message|sms)\b|\bshare\swith\s\d+\s(?:groups?|friends|contacts)\b/gi,
    title: 'Chain-forwarding request',
    detail: 'Messages that demand forwarding spread scams and hoaxes. Legitimate offers never depend on you forwarding anything.',
  },
  {
    id: 'upi-deeplink', points: 14, severity: 'medium',
    re: /\bupi:\/\/(?:pay|collect)[^\s]*/gi,
    title: 'Direct UPI payment link',
    detail: 'This link opens your UPI app with a pre-filled payment. Only proceed if you initiated this and know exactly who is receiving the money.',
  },
  {
    id: 'family-impersonation', points: 28, severity: 'high',
    re: /\b(?:hi|hey|hello)\s*,?\s+(?:mum|mom|mommy|mummy|dad|daddy|papa|mama|beta)\b|\bthis\sis\smy\s(?:new|temporary)\s(?:number|phone)\b|\b(?:lost|broke|dropped|damaged)\smy\sphone\b[^.!?\n]{0,60}?\b(?:new\s?number|whatsapp|message\sme)\b/gi,
    title: '"Hi mum, this is my new number" impersonation',
    detail: 'The family-emergency WhatsApp scam: a stranger poses as your child or relative on a "new number", then asks for an urgent transfer. Always verify by calling the person\'s original number before sending anything.',
  },
  {
    id: 'wa-code-hijack', points: 35, severity: 'high',
    re: /\b(?:whatsapp|verification|6[- ]?digit)\s?code\b[^.!?\n]{0,70}?\b(?:send|share|forward|give)\b[^.!?\n]{0,25}?\b(?:it\s)?(?:back|me|us|here)\b|\b(?:send|share|forward|give)\b[^.!?\n]{0,30}?\b(?:me|us|back)\b[^.!?\n]{0,30}?\bcode\b|\b(?:accidentally|by\smistake|mistakenly)\b[^.!?\n]{0,40}?\b(?:sent|send|forwarded?)\b[^.!?\n]{0,40}?\b(?:code|otp)\b|\b(?:sent|forwarded)\b[^.!?\n]{0,40}?\b(?:code|otp)\b[^.!?\n]{0,40}?\b(?:by\smistake|accidentally|mistakenly)\b/gi,
    title: 'WhatsApp verification-code theft',
    detail: '"I sent my code to your number by mistake — please send it back" is how WhatsApp accounts get stolen. That 6-digit SMS code is the login key to YOUR account; sharing it hands your WhatsApp (and every group you\'re in) to the scammer.',
  },
];

// ---------------------------------------------------------------- helpers

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function registeredDomain(host) {
  const labels = host.toLowerCase().split('.');
  if (labels.length < 2) return host;
  const last2 = labels.slice(-2).join('.');
  if (TWO_PART_SUFFIXES.has(last2) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return last2;
}

function secondLevel(domain) {
  return domain.split('.')[0];
}

const URL_RE = /\b(?:https?:\/\/[^\s<>"'()[\]]+|www\.[^\s<>"'()[\]]+|upi:\/\/[^\s<>"'()[\]]+|(?:[a-z0-9][a-z0-9-]{0,62}\.)+[a-z]{2,}(?:\/[^\s<>"'()[\]]*)?)/gi;

function extractUrls(text) {
  const out = [];
  const seen = new Set();
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[0].replace(/[.,!?;:'")\]]+$/, '');
    if (raw.startsWith('upi://')) continue; // handled by text rule
    const hasScheme = /^https?:\/\//i.test(raw);
    const hasWww = /^www\./i.test(raw);
    if (!hasScheme && !hasWww) {
      // bare domain — only accept known TLDs to avoid "e.g." style false hits
      const hostPart = raw.split('/')[0];
      const tld = hostPart.split('.').pop().toLowerCase();
      if (!KNOWN_TLDS.has(tld)) continue;
    }
    const href = hasScheme ? raw : `http://${raw}`;
    let parsed;
    try { parsed = new URL(href); } catch { continue; }
    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    out.push({ raw, href, parsed, index: m.index, schemeExplicit: hasScheme });
  }
  return out;
}

function severityFor(points) {
  return points >= 25 ? 'high' : points >= 12 ? 'medium' : 'low';
}

/* WhatsApp chat exports & multi-message copies prefix every line with
   "12/05/26, 10:31 pm - Name:" (Android) or "[10:31, 12/05/2026] Name:" (iOS).
   Strip those prefixes so the rules run on the message text itself. */
const WA_LINE_PREFIX = /^(?:\[?\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s?(?:[APap]\.?[Mm]\.?)?\]?|\[?\d{1,2}:\d{2}(?:\s?[APap][Mm])?,\s+\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\]?)\s*[-–—]?\s*(?:[^:\n]{1,40}:\s)?/;

function stripWhatsAppChat(text) {
  const lines = text.split('\n');
  let hits = 0;
  const cleaned = lines.map((line) => {
    const m = line.match(WA_LINE_PREFIX);
    if (m && m[0].length > 6 && m[0].length < line.length) {
      hits += 1;
      return line.slice(m[0].length);
    }
    return line;
  });
  // only treat as a chat when ≥2 lines match, so dates in normal text are left alone
  return hits >= 2 ? cleaned.join('\n') : null;
}

// ---------------------------------------------------------------- URL checks

function analyzeUrl({ raw, href, parsed, schemeExplicit }) {
  const findings = [];
  const host = parsed.hostname.toLowerCase();
  const domain = registeredDomain(host);
  const trusted = TRUSTED_DOMAINS.has(domain);
  const add = (id, points, title, detail) =>
    findings.push({ id, points, severity: severityFor(points), title, detail, evidence: raw });

  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (isIp) {
    add('ip-host', 30, 'Link points to a raw IP address',
      `Instead of a domain name, this link goes straight to ${host}. Real financial sites never do this — it hides who owns the server.`);
  }

  if (host.split('.').some((l) => l.startsWith('xn--'))) {
    add('punycode', 30, 'Look-alike (punycode) characters in domain',
      'The domain uses encoded international characters that can visually imitate a real bank\'s name while being a completely different site.');
  }

  if (SHORTENERS.has(domain)) {
    add('shortener', 15, 'Shortened link hides the real destination',
      `${domain} links can redirect anywhere. Banks send links on their own domain — a shortened link in a money-related message is a red flag.`);
  }

  const tld = domain.split('.').pop();
  if (!trusted && RISKY_TLDS.has(tld)) {
    add('risky-tld', 18, `High-risk domain ending ".${tld}"`,
      `The ".${tld}" extension is cheap or free to register and is heavily used in phishing campaigns. Legitimate banks don't use it.`);
  }

  if (schemeExplicit && parsed.protocol === 'http:' && !isIp) {
    add('no-https', 14, 'Connection is not encrypted (http)',
      'The link uses plain http — anything you type there, including passwords, travels unencrypted. No real payment page works without https.');
  }

  if (parsed.username || raw.includes('@') && /https?:\/\/[^/]*@/.test(raw)) {
    add('at-trick', 25, 'Deceptive "@" in the address',
      'Everything before the "@" is decoration — the browser only uses what comes after it. This trick makes a scam URL look like a bank\'s.');
  }

  if (parsed.port && !['', '80', '443'].includes(parsed.port)) {
    add('odd-port', 12, `Unusual port number :${parsed.port}`,
      'Legitimate banking sites run on standard web ports. A custom port usually means a makeshift or compromised server.');
  }

  // WhatsApp links: the platform itself is legitimate, but these links are
  // how scammers funnel victims into chats and groups they control.
  if (domain === 'whatsapp.com' || domain === 'wa.me') {
    if (host === 'chat.whatsapp.com') {
      add('wa-group-invite', 16, 'WhatsApp group invite link',
        'Unsolicited group invites are how investment-tip, trading, and task-job scams recruit victims. Joining also exposes your number and profile photo to everyone running the scam.');
    } else if (domain === 'wa.me' || host === 'api.whatsapp.com') {
      add('wa-click-chat', 10, 'Opens a WhatsApp chat with an unknown number',
        'This "click to chat" link starts a WhatsApp conversation with a number you don\'t know. Scammers prefer moving you to WhatsApp because it bypasses SMS spam filters and hides their identity.');
    }
  }

  if (!trusted && !isIp) {
    // brand impersonation: brand appears in host but domain isn't official
    const hostFlat = host.replace(/[-.]/g, '');
    const tokens = host.split(/[.-]/);
    for (const b of BRANDS) {
      const officialHit = b.official.includes(domain);
      if (officialHit) continue;
      const present = b.name.length <= 4 ? tokens.includes(b.name) : hostFlat.includes(b.name);
      if (present) {
        add('brand-impersonation', 35, `Pretends to be ${b.name.toUpperCase()} but isn't`,
          `The address contains "${b.name}" but the actual registered domain is "${domain}"${b.official.length ? `, not ${b.official[0]}` : ''}. This is how fake bank pages are named.`);
        break;
      }
    }

    // typosquatting on the second-level label
    const sld = secondLevel(domain);
    if (sld.length >= 4 && !findings.some((f) => f.id === 'brand-impersonation')) {
      for (const b of BRANDS) {
        const targets = [b.name, ...b.official.map(secondLevel)];
        for (const t of targets) {
          if (t.length < 4 || sld === t) continue;
          const maxDist = t.length >= 8 ? 2 : 1;
          if (levenshtein(sld, t) <= maxDist) {
            add('typosquat', 35, `Misspelled look-alike of "${t}"`,
              `"${sld}" is one keystroke away from "${t}" — deliberate misspellings catch people who don't look twice at the address bar.`);
            break;
          }
        }
        if (findings.some((f) => f.id === 'typosquat')) break;
      }
    }

    const subCount = host.split('.').length - domain.split('.').length;
    if (subCount >= 3) {
      add('deep-subdomains', 10, 'Suspiciously long chain of subdomains',
        'Stacking many subdomains pushes the real (scam) domain out of view on a phone screen, so only the convincing first part is visible.');
    }

    const hyphens = (domain.match(/-/g) || []).length;
    if (hyphens >= 2) {
      add('hyphen-domain', 8, 'Multiple hyphens in domain',
        'Domains like "secure-bank-login.com" are assembled from keywords to look official. Real institutions use short, established domains.');
    }

    const dWords = SENSITIVE_DOMAIN_WORDS.filter((w) => host.includes(w));
    if (dWords.length) {
      add('bait-words-domain', 12, `Bait words in the address: ${dWords.slice(0, 3).join(', ')}`,
        'Words like "secure", "verify", or "kyc" inside a domain name are there to manufacture trust — real bank domains don\'t need them.');
    }
  }

  const pathQ = (parsed.pathname + parsed.search).toLowerCase();
  if (/\.apk(\b|$)/.test(pathQ)) {
    add('apk-link', 30, 'Link downloads an APK file',
      'This directly downloads an Android app outside the Play Store. Fake banking APKs steal SMS OTPs. Never install apps from message links.');
  } else if (/(verify|kyc|otp|unlock|suspend|refund|claim|reward|lucky|gift|prize)/.test(pathQ)) {
    add('bait-words-path', 8, 'Bait words in the link path',
      'The page path uses pressure words typical of phishing pages rather than real banking portals.');
  }

  return {
    raw, href, host, domain, trusted, findings,
    points: findings.reduce((s, f) => s + f.points, 0),
  };
}

// ---------------------------------------------------------------- main entry

export function analyze(text) {
  let trimmed = text.trim();
  const findings = [];
  const highlights = [];
  const positives = [];

  // WhatsApp chat copies: strip timestamp/sender prefixes so rules and
  // highlight offsets work on the actual message content.
  const waChat = stripWhatsAppChat(trimmed);
  if (waChat !== null) {
    trimmed = waChat;
    findings.push({
      id: 'wa-chat-parsed', points: 0, severity: 'low',
      title: 'WhatsApp chat detected',
      detail: 'Timestamps and sender names were removed automatically and every message in the copied chat was scanned.',
      evidence: null,
    });
  }

  // --- text rules
  for (const rule of TEXT_RULES) {
    rule.re.lastIndex = 0;
    let first = null;
    for (const m of trimmed.matchAll(rule.re)) {
      if (!first) first = m;
      highlights.push({ start: m.index, end: m.index + m[0].length, severity: rule.severity });
    }
    if (first) {
      findings.push({
        id: rule.id, points: rule.points, severity: rule.severity,
        title: rule.title, detail: rule.detail,
        evidence: first[0].length > 90 ? first[0].slice(0, 87) + '…' : first[0],
      });
    }
  }

  // shouting heuristic
  const letters = trimmed.replace(/[^a-zA-Z]/g, '');
  const caps = trimmed.replace(/[^A-Z]/g, '');
  if (letters.length > 40 && caps.length / letters.length > 0.5) {
    findings.push({
      id: 'shouting', points: 5, severity: 'low',
      title: 'Excessive capital letters',
      detail: 'ALL-CAPS pressure formatting is common in scam blasts and rare in genuine bank communication.',
      evidence: null,
    });
  }

  // --- URLs
  const urls = extractUrls(trimmed).map((u) => {
    const r = analyzeUrl(u);
    if (r.findings.length) {
      const sev = severityFor(Math.max(...r.findings.map((f) => f.points)));
      highlights.push({ start: u.index, end: u.index + u.raw.length, severity: sev });
    }
    findings.push(...r.findings);
    return r;
  });

  for (const u of urls) {
    if (u.trusted && !u.findings.length) {
      positives.push(`${u.domain} matches an official, known finance domain.`);
    }
  }

  const score = Math.min(100, findings.reduce((s, f) => s + f.points, 0));

  let verdict;
  if (score >= 55) {
    verdict = {
      level: 'high', label: 'Likely scam',
      blurb: 'This matches known fraud patterns. Do not click the link, pay, or reply. Block and report the sender.',
    };
  } else if (score >= 25) {
    verdict = {
      level: 'medium', label: 'Suspicious',
      blurb: 'Several warning signs found. Verify through your bank\'s official app or phone number before acting on this.',
    };
  } else {
    verdict = {
      level: 'low', label: 'No obvious red flags',
      blurb: 'We didn\'t find common scam patterns — but stay alert. When money is involved, always confirm through official channels.',
    };
  }

  findings.sort((a, b) => b.points - a.points);

  return { score, verdict, findings, urls, positives, highlights, text: trimmed };
}

export const EXAMPLES = [
  {
    label: 'Fake KYC SMS',
    text: 'Dear Customer, your SBI YONO account will be suspended today! Your KYC has expired. Update immediately by clicking http://sbi-kyc-update.xyz/verify or your account will be blocked within 24 hours.',
  },
  {
    label: 'Lottery scam',
    text: 'CONGRATULATIONS! Your mobile number has won ₹25,00,000 in the KBC Lucky Draw. To claim your prize, pay a registration fee of ₹4,999 and share your account number and OTP at bit.ly/kbc-claim-prize',
  },
  {
    label: 'UPI refund trap',
    text: 'Hello, I accidentally sent you a payment. Please accept the collect request and enter your UPI PIN to receive the refund of Rs 5000. Do it immediately, I am in hospital.',
  },
  {
    label: 'WhatsApp job offer',
    text: 'Hello! I am Priya from TalentFirst HR 🌟 We offer part-time work from home — earn ₹3000 to ₹8000 daily for simple tasks like rating hotels online. No experience needed! Limited seats, join our WhatsApp group today: https://chat.whatsapp.com/KxT4mP2vR8s',
  },
  {
    label: '"Hi mum" scam',
    text: 'Hi mum, I dropped my phone in water so this is my new number 😞 I need to pay my hostel fee today itself but my banking app is locked. Can you transfer Rs 15,000 to my friend\'s account? I will return it tomorrow. Please don\'t tell dad, he will worry.',
  },
  {
    label: 'Genuine bank message',
    text: 'Your a/c X1234 is debited for Rs 499.00 on 11-06-26 (UPI Ref 615243). If not done by you, call 1800 1234 from your registered mobile or visit https://www.hdfcbank.com',
  },
];
