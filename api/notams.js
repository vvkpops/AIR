// api/notams.js
// Lightweight NOTAM proxy with a small NAV CANADA CFPS fallback for Canadian ICAOs.
// Goal: keep this file small and predictable — preserve original NAV CANADA raw payload
// and return a cleaned `english` string (plus some basic parsed fields) when FAA returns nothing.

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

  // FAA credentials (optional): if not set, we'll still attempt NAVCAN fallback for Canadian ICAOs
  const CLIENT_ID = process.env.REACT_APP_FAA_CLIENT_ID;
  const CLIENT_SECRET = process.env.REACT_APP_FAA_API_KEY;

  // Small helpers --------------------------------------------------------------
  const stripParens = s => (typeof s === 'string' ? s.replace(/^\(+|\)+$/g, '').trim() : '');

  // Normalise jammed A)/B)/C)/E) tokens onto separate lines and collapse whitespace.
  const normalizeNotamText = (txt) => {
    if (!txt) return '';
    let t = String(txt).replace(/\r/g, '').trim();

    // Unescape common escaped newline sequences
    t = t.replace(/\\n/g, '\n');

    // Remove surrounding single outer parentheses if they wrap the whole payload
    if (t.startsWith('(') && t.endsWith(')')) {
      t = t.slice(1, -1).trim();
    }

    // Put tokens on their own lines: Q) A) B) C) D) E) F) G)
    // This handles cases like "A) CZQX B) 2508070901 C) 2511051800EST"
    t = t.replace(/\s*([QABCDEFG]\))/gi, '\n$1');

    // Ensure token lines have a trailing space after "A)" etc.
    t = t.split('\n').map(l => l.trim().replace(/^([QABCDEFG]\))\s*/i, '$1 ')).filter(Boolean).join('\n');

    // Collapse multiple internal spaces
    t = t.replace(/[ \t]{2,}/g, ' ');

    return t.trim();
  };

  // Extract A/B/C/E simple lines from a normalized block
  const extractToken = (block, token) => {
    if (!block) return '';
    const re = new RegExp(`^${token}\\)\\s*(.*)$`, 'im');
    const m = block.match(re);
    return m ? m[1].trim() : '';
  };

  // Try FAA first (if credentials available)
  let parsed = [];
  try {
    if (CLIENT_ID && CLIENT_SECRET) {
      const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${upicao}&responseFormat=geoJson&pageSize=1000`;
      const faaResp = await fetch(faaUrl, {
        headers: {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          Accept: 'application/json'
        },
        // keep short timeout expectations for serverless
      });

      if (faaResp.ok) {
        try {
          const j = await faaResp.json();
          const items = j?.items || [];
          if (items.length > 0) {
            parsed = items.map(item => {
              const core = item.properties?.coreNOTAMData?.notam || {};
              const translation = (item.properties?.coreNOTAMData?.notamTranslation || [])[0] || {};
              const raw = core.text || translation.formattedText || translation.simpleText || '';
              const english = raw ? normalizeNotamText(raw) : null;
              return {
                raw: raw || '',
                english,
                french: null,
                number: core.number || '',
                icao: core.icaoLocation || core.location || upicao,
                summary: translation.simpleText || translation.formattedText || core.text || '',
                body: core.text || translation.formattedText || '',
                source: 'FAA'
              };
            });
          }
        } catch (e) {
          // parse error – we'll continue to fallback if needed
          console.warn('FAA parse error', e?.message);
        }
      } else {
        // non-OK from FAA: if non-Canadian, bail with an error, else try NAVCAN below
        if (!upicao.startsWith('C')) {
          return res.status(faaResp.status).json({ error: `FAA API error: ${faaResp.status} ${faaResp.statusText}` });
        }
        console.warn(`FAA API returned ${faaResp.status} for ${upicao}, will attempt NAVCAN fallback`);
      }
    }
  } catch (e) {
    console.warn('FAA fetch error', e?.message || e);
    // continue to NAVCAN fallback for Canadian ICAOs
  }

  // If FAA returned nothing and this is a Canadian ICAO, try NAV CANADA CFPS
  if (parsed.length === 0 && upicao.startsWith('C')) {
    try {
      // NAV CANADA alpha API (may return JSON or raw text)
      const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${upicao}&alpha=notam`;
      const navResp = await fetch(navUrl, { headers: { Accept: 'application/json, text/plain, */*' } });
      const rawText = await navResp.text();

      // Try JSON first
      let navData = null;
      try { navData = JSON.parse(rawText); } catch (e) { navData = null; }

      const items = [];
      if (navData) {
        // NAV result shapes vary; try reasonable keys then fallback
        if (Array.isArray(navData)) {
          navData.forEach(i => items.push(i));
        } else if (Array.isArray(navData.notam)) {
          navData.notam.forEach(i => items.push(i));
        } else if (Array.isArray(navData.Alpha)) {
          navData.Alpha.forEach(i => items.push(i));
        } else {
          // flatten first found array value or take the object itself
          const arr = Object.values(navData).find(v => Array.isArray(v));
          if (arr) arr.forEach(i => items.push(i));
          else items.push(navData);
        }
      } else {
        // Not JSON — split into chunks separated by blank lines (common)
        const chunks = rawText.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
        if (chunks.length === 0 && rawText.trim()) chunks.push(rawText.trim());
        chunks.forEach(c => items.push({ raw: c }));
      }

      // For each item try to preserve original raw and produce a cleaned english string
      items.forEach(it => {
        // collect the original raw as best we can
        let originalRaw = '';
        if (typeof it === 'string') originalRaw = it;
        else if (it.raw && typeof it.raw === 'string') originalRaw = it.raw;
        else if (it.notam && typeof it.notam === 'string') originalRaw = it.notam;
        else if (it.text && typeof it.text === 'string') originalRaw = it.text;
        else if (it.english && typeof it.english === 'string') originalRaw = it.english;
        else originalRaw = JSON.stringify(it);

        originalRaw = originalRaw.trim();

        const english = normalizeNotamText(originalRaw);
        const aLine = extractToken(english, 'A') || it.site || it.station || '';
        const bLine = extractToken(english, 'B') || '';
        const cLine = extractToken(english, 'C') || '';
        const eLine = extractToken(english, 'E') || '';

        // attempt to find NOTAM number token like H3902/25 in top of block
        const firstLine = english.split('\n')[0] || originalRaw.split('\n')[0] || '';
        const m = firstLine.match(/([A-Z0-9]+\/\d{2,4})/i);
        const number = it.id || it.notamId || it.number || (m ? m[1] : '');

        parsed.push({
          raw: originalRaw,
          english: english || null,
          french: null,
          number: number || '',
          icao: aLine || upicao,
          aLine: aLine || '',
          bLine: bLine || '',
          cLine: cLine || '',
          summary: eLine || '',
          body: english || originalRaw,
          source: 'NAVCAN'
        });
      });
    } catch (e) {
      console.warn('NAVCAN fallback error', e?.message || e);
    }
  }

  // Final: return parsed array (may be empty)
  // Keep the response compact and predictable: array of objects with raw/english/french and a few fields
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300'); // short caching
  return res.status(200).json(parsed);
}
