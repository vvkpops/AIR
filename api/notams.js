// api/notams.js
// Serverless NOTAM proxy with NAV CANADA CFPS fallback.
// Self-contained parsing logic adapted from src/utils/parsers/alphaParsers.js (no dynamic imports).

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { icao } = req.query;
  if (!icao || typeof icao !== 'string' || icao.length !== 4) {
    return res.status(400).json({ error: 'Invalid ICAO code' });
  }
  const upicao = icao.toUpperCase();

  const CLIENT_ID = process.env.REACT_APP_FAA_CLIENT_ID;
  const CLIENT_SECRET = process.env.REACT_APP_FAA_API_KEY;

  // ---- Small parser adapted from your alphaParsers.js (keeps behavior consistent) ----
  function stripSurroundingParens(s) {
    if (!s) return '';
    s = String(s).trim();
    if (s.startsWith('(') && s.endsWith(')')) return s.slice(1, -1).trim();
    return s;
  }

  function normalizeAlphaNotamText(s) {
    if (!s) return '';
    let txt = String(s).replace(/\r/g, '').trim();
    // Unescape escaped newlines
    txt = txt.replace(/\\n/g, '\n');
    // Remove one outer pair of surrounding parentheses if present
    if (txt.startsWith('(') && txt.endsWith(')')) txt = txt.slice(1, -1).trim();
    // Insert newline before token markers Q), A), B), C), D), E), F), G)
    txt = txt.replace(/\s*([QABCDEFG]\))/gi, '\n$1');
    // Clean up each line
    const lines = txt.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return lines.map(l => l.replace(/^([QABCDEFG]\))\s*/i, '$1 ')).join('\n').trim();
  }

  function extractRawField(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') {
      let s = val.trim();
      if ((s.startsWith('{') || s.startsWith('['))) {
        try {
          const parsed = JSON.parse(s);
          if (parsed && typeof parsed === 'object') {
            if (parsed.english && typeof parsed.english === 'string' && parsed.english.trim()) return stripSurroundingParens(parsed.english);
            if (parsed.raw && typeof parsed.raw === 'string' && parsed.raw.trim()) return stripSurroundingParens(parsed.raw);
            if (parsed.text && typeof parsed.text === 'string' && parsed.text.trim()) return stripSurroundingParens(parsed.text);
            return JSON.stringify(parsed, null, 2);
          }
        } catch (e) { /* not JSON */ }
      }
      return stripSurroundingParens(s);
    }
    if (typeof val === 'object') {
      if (Array.isArray(val)) {
        if (val.every(v => typeof v === 'string')) return val.map(v => stripSurroundingParens(v)).join('\n\n');
        try { return JSON.stringify(val, null, 2); } catch (e) { /* fallthrough */ }
      }
      const preferred = ['english', 'raw', 'text', 'body', 'report', 'metar', 'taf', 'message', 'remarks'];
      for (const k of preferred) {
        if (val[k] && typeof val[k] === 'string' && val[k].trim()) return stripSurroundingParens(val[k]);
      }
      for (const k of Object.keys(val)) {
        const v = val[k];
        if (typeof v === 'string' && v.trim().length > 0 && (v.includes('E)') || v.includes('Q)') || v.includes('NOTAM'))) {
          return stripSurroundingParens(v);
        }
      }
      try { return JSON.stringify(val, null, 2); } catch { return String(val); }
    }
    return String(val);
  }

  function parseRawAlpha(item) {
    if (item === null || item === undefined) return '';
    if (typeof item === 'string') return extractRawField(item);
    if (item.english && typeof item.english === 'string' && item.english.trim()) return extractRawField(item.english);
    if (item.french && typeof item.french === 'string' && item.french.trim()) return extractRawField(item.french);
    if (item.raw) return extractRawField(item.raw);
    const otherFields = ['text', 'body', 'report', 'metar', 'taf', 'message', 'remarks'];
    for (const f of otherFields) {
      if (item[f] && (typeof item[f] === 'string' || typeof item[f] === 'object')) return extractRawField(item[f]);
    }
    if (Array.isArray(item)) {
      const parts = item.map(it => (typeof it === 'string' ? extractRawField(it) : parseRawAlpha(it)));
      return parts.join('\n\n');
    }
    if (item.data && Array.isArray(item.data)) {
      const parts = item.data.map(d => parseRawAlpha(d));
      return parts.join('\n\n');
    }
    try { return JSON.stringify(item, null, 2); } catch { return String(item); }
  }
  // ---- end parser ----

  // small token extractor from a normalized block
  const extractTokenSimple = (block, token) => {
    if (!block) return '';
    const re = new RegExp(`${token}\\)\\s*([^\\n\\r]*)`, 'i');
    const m = block.match(re);
    return m ? m[1].trim() : '';
  };

  const captureOriginalRaw = (it, rawText) => {
    if (!it && !rawText) return '';
    if (typeof it === 'string') return it.trim();
    if (it && typeof it === 'object') {
      if (it.raw && typeof it.raw === 'string') return it.raw.trim();
      if (it.notam && typeof it.notam === 'string') return it.notam.trim();
      if (it.text && typeof it.text === 'string') return it.text.trim();
      if (it.english && typeof it.english === 'string') return it.english.trim();
    }
    if (rawText && typeof rawText === 'string') return rawText.trim();
    try { return JSON.stringify(it); } catch { return ''; }
  };

  let parsed = [];

  // 1) Try FAA (if creds present)
  try {
    if (CLIENT_ID && CLIENT_SECRET) {
      const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${upicao}&responseFormat=geoJson&pageSize=1000`;
      const faaResp = await fetch(faaUrl, {
        headers: {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          Accept: 'application/json'
        }
      });

      if (faaResp.ok) {
        try {
          const j = await faaResp.json();
          const items = j?.items || [];
          if (items.length > 0) {
            parsed = items.map(item => {
              const core = item.properties?.coreNOTAMData?.notam || {};
              const translation = (item.properties?.coreNOTAMData?.notamTranslation || [])[0] || {};
              const originalRaw = core.text || translation.formattedText || translation.simpleText || '';
              const englishRaw = parseRawAlpha(originalRaw || core || translation) || null;
              return {
                raw: originalRaw || '',
                english: englishRaw,
                french: null,
                number: core.number || '',
                icao: core.icaoLocation || core.location || upicao,
                aLine: '', bLine: '', cLine: '',
                qLine: core.qLine || '',
                summary: translation.simpleText || translation.formattedText || core.text || '',
                body: core.text || translation.formattedText || '',
                source: 'FAA'
              };
            });
          }
        } catch (e) {
          console.warn('FAA parse error', e?.message || e);
        }
      } else {
        if (!upicao.startsWith('C')) {
          return res.status(faaResp.status).json({ error: `FAA API error: ${faaResp.status} ${faaResp.statusText}` });
        }
        console.warn(`FAA API returned ${faaResp.status} for ${upicao}, will attempt NAVCAN fallback`);
      }
    }
  } catch (e) {
    console.warn('FAA fetch error', e?.message || e);
  }

  // 2) NAV CANADA CFPS fallback for Canadian ICAOs only
  if (parsed.length === 0 && upicao.startsWith('C')) {
    try {
      const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${upicao}&alpha=notam`;
      const navResp = await fetch(navUrl, { headers: { Accept: 'application/json, text/plain, */*' } });
      const rawText = await navResp.text();

      let navData = null;
      try { navData = JSON.parse(rawText); } catch (_) { navData = null; }

      const items = [];
      if (navData) {
        if (Array.isArray(navData)) items.push(...navData);
        else if (Array.isArray(navData.notam)) items.push(...navData.notam);
        else if (Array.isArray(navData.Alpha)) items.push(...navData.Alpha);
        else {
          const arr = Object.values(navData).find(v => Array.isArray(v));
          if (arr) items.push(...arr);
          else items.push(navData);
        }
      } else {
        const chunks = rawText.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
        if (chunks.length === 0 && rawText.trim()) chunks.push(rawText.trim());
        chunks.forEach(c => items.push({ raw: c }));
      }

      items.forEach(it => {
        const originalRaw = captureOriginalRaw(it, rawText);
        const english = parseRawAlpha(it) || parseRawAlpha(originalRaw) || null;
        const aLine = extractTokenSimple(english, 'A') || it.site || it.station || '';
        const bLine = extractTokenSimple(english, 'B') || it.start || it.begin || '';
        const cLine = extractTokenSimple(english, 'C') || it.end || it.finish || '';
        const eLine = extractTokenSimple(english, 'E') || '';
        const firstLine = (english && english.split('\n')[0]) || (originalRaw && originalRaw.split('\n')[0]) || '';
        const numMatch = firstLine.match(/([A-Z0-9]+\/\d{2,4})/i);
        const number = it.id || it.notamId || it.number || (numMatch ? numMatch[1] : '');

        parsed.push({
          raw: originalRaw || '',
          english: english || null,
          french: null,
          number: number || '',
          icao: aLine || upicao,
          aLine: aLine || '',
          bLine: bLine || '',
          cLine: cLine || '',
          summary: eLine || '',
          body: english || originalRaw || '',
          qLine: '',
          source: 'NAVCAN'
        });
      });
    } catch (e) {
      console.warn('NAVCAN fallback error', e?.message || e);
    }
  }

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  return res.status(200).json(parsed);
}
