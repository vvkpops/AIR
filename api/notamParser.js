// Lightweight port of your notamParser.ts -> JS
// Exports cleanNotams(inputArray) -> array of normalized NOTAMs

// Try to parse inner JSON string (CFPS often returns JSON inside a string)
const tryParseInner = (s) => {
  if (!s) return {};
  try {
    const inner = JSON.parse(s);
    // Unescape common sequences in values
    const out = {};
    Object.entries(inner).forEach(([k, v]) => {
      out[k] = typeof v === 'string' ? deescape(v) : v;
    });
    return out;
  } catch {
    return { raw: deescape(s) };
  }
};

const deescape = (t) =>
  String(t || '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');

const pickLang = (inner) =>
  (inner && inner.english && inner.english.trim()) ||
  (inner && inner.raw && inner.raw.trim()) ||
  '';

const extractSection = (text, label) => {
  if (!text) return '';
  const re = new RegExp(`${label}\\)\\s*([\\s\\S]*?)(?:\\n[A-Z]\\)|$)`, 'm');
  const m = text.match(re);
  return m ? m[1].trim() : '';
};

const parseA_FIRs = (text) => {
  if (!text) return undefined;
  const m = text.match(/A\)\s+([A-Z0-9 \-]+)/);
  if (!m) return undefined;
  return m[1].trim().split(/\s+/).filter(Boolean);
};

const parseBC = (text) => {
  if (!text) return {};
  const b = text.match(/B\)\s*(\d{10})/); // YYMMDDHHMM
  const c = text.match(/C\)\s*(PERM|(\d{10})([A-Z]{3})?)/);

  const fmt = (yymmddhhmm) => {
    const yy = +yymmddhhmm.slice(0, 2);
    const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
    const MM = +yymmddhhmm.slice(2, 4);
    const dd = +yymmddhhmm.slice(4, 6);
    const hh = +yymmddhhmm.slice(6, 8);
    const mm = +yymmddhhmm.slice(8, 10);
    const d = new Date(Date.UTC(yyyy, MM - 1, dd, hh, mm));
    return d.toISOString();
  };

  let start;
  let end;
  let est = false;

  if (b) start = fmt(b[1]);
  if (c) {
    if (c[1] === 'PERM') {
      end = 'PERM';
    } else if (c[2]) {
      end = fmt(c[2]);
      est = c[3] === 'EST';
    }
  }
  return { start, end, est };
};

const parsePosRadius = (s) => {
  if (!s) return { center: null, radiusNm: null };
  const m = s.match(/^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])(\d{3})$/);
  if (!m) return { center: null, radiusNm: null };

  const latDeg = +m[1], latMin = +m[2], latHem = m[3];
  const lonDeg = +m[4], lonMin = +m[5], lonHem = m[6];
  const radiusNm = +m[7];

  const lat = (latDeg + latMin / 60) * (latHem === 'S' ? -1 : 1);
  const lon = (lonDeg + lonMin / 60) * (lonHem === 'W' ? -1 : 1);

  return { center: { lat, lon }, radiusNm };
};

const parseQ = (line) => {
  if (!line) return null;
  const q = line.trim();
  if (!/^Q\)/.test(q)) return null;
  const content = q.slice(2).trim();
  const parts = content.split('/').map(p => p.trim());

  const fir = parts[0] || undefined;
  const code = parts[1] || undefined;
  const traffic = parts[2] || undefined;
  const purpose = parts[3] || undefined;
  const scope = parts[4] || undefined;
  const lower = parts[5] || undefined;
  const upper = parts[6] || undefined;
  const posrad = parts[7] || undefined;

  const parsedPos = parsePosRadius(posrad);

  return { fir, code, traffic, purpose, scope, lower, upper, ...parsedPos };
};

const findQLineIn = (text) => {
  if (!text) return undefined;
  const m = text.match(/^(Q\)\s*[^\n\r]+)/m);
  return m ? m[1] : undefined;
};

const computeActive = (start, end) => {
  if (!start) return true;
  const now = Date.now();
  const s = new Date(start).getTime();
  if (end && end !== 'PERM' && end !== 'EST') {
    const e = new Date(end).getTime();
    return now >= s && now <= e;
  }
  return now >= s;
};

// Main exported function
export function cleanNotams(input) {
  if (!Array.isArray(input)) return [];

  return input.map((n) => {
    const innerSummary = tryParseInner(n.summary);
    const innerBody = tryParseInner(n.body);

    const combined = pickLang(innerSummary) || pickLang(innerBody);

    const raw = combined || innerSummary.raw || innerBody.raw || '';

    const qLineProvided = n.qLine && n.qLine.trim() ? n.qLine : undefined;
    const qLineFound = qLineProvided || findQLineIn(raw);

    const firs = parseA_FIRs(raw);
    const { start, end, est } = parseBC(raw);
    const qParsed = qLineFound ? parseQ(qLineFound) : null;

    const english =
      (innerSummary && innerSummary.english && innerSummary.english.trim()) ||
      (innerBody && innerBody.english && innerBody.english.trim()) ||
      extractSection(raw, 'E');

    // detect FR: block if present
    let frBlock = null;
    if (raw && raw.includes('\nFR:\n')) {
      frBlock = raw.split('\nFR:\n').slice(1).join('\nFR:\n').trim();
    } else {
      const tmp = extractSection(raw, 'F');
      if (tmp) frBlock = tmp;
    }

    const french =
      (innerSummary && innerSummary.french && innerSummary.french.trim()) ||
      (innerBody && innerBody.french && innerBody.french.trim()) ||
      (frBlock || null);

    const out = {
      id: n.number || '',
      icao: n.icao || n.location || '',
      type: n.type || '',
      firs: firs || [],
      q: qParsed
        ? {
            fir: qParsed.fir,
            code: qParsed.code,
            traffic: qParsed.traffic,
            purpose: qParsed.purpose,
            scope: qParsed.scope,
            lower: qParsed.lower,
            upper: qParsed.upper,
            center: qParsed.center,
            radiusNm: qParsed.radiusNm,
          }
        : null,
      start: start || undefined,
      end: end || undefined,
      est: !!est,
      english: english ? String(english).trim() : '',
      french: french || null,
      raw: raw,
      activeNow: computeActive(start, end),
    };

    return out;
  });
}
