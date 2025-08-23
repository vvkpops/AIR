// api/notams.js - Vercel serverless function for NOTAM fetching
// Updated: improved NAV CANADA CFPS fallback with NOTAM text cleanup/normalization
// Uses normalization logic adapted from your front-end alphaParsers to split A)/B)/C)/E) when jammed.

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { icao } = req.query;

  if (!icao || icao.length !== 4) {
    return res.status(400).json({ error: 'Invalid ICAO code' });
  }

  const CLIENT_ID = process.env.REACT_APP_FAA_CLIENT_ID;
  const CLIENT_SECRET = process.env.REACT_APP_FAA_API_KEY;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing FAA API credentials');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // ----------------------
  // Helpers for navcan normalization (adapted from alphaParsers)
  // ----------------------
  function stripSurroundingParens(s) {
    if (!s) return '';
    s = String(s).trim();
    if (s.startsWith('(') && s.endsWith(')')) {
      return s.slice(1, -1).trim();
    }
    return s;
  }

  function normalizeAlphaNotamText(s) {
    if (!s) return '';
    let txt = String(s).replace(/\r/g, '').trim();

    // Unwrap outer parentheses repeatedly (safe guard)
    let loopGuard = 0;
    while (txt.startsWith('(') && txt.endsWith(')') && loopGuard < 5) {
      const inner = txt.slice(1, -1).trim();
      if (inner === txt) break;
      txt = inner;
      loopGuard++;
    }

    // Unescape common escaped-newline sequences
    if (txt.indexOf('\\n') !== -1) {
      txt = txt.replace(/\\n/g, '\n');
    }

    // Ensure newline after NOTAM header
    txt = txt.replace(/(NOTAMN?|NOTAMR?)(\s*)(?=[A-Z0-9()\/\s]+)/i, (m, p1) => `${p1}\n`);

    // Insert newline before token markers like "Q)", "A)", "B)", ... even if they are on same line
    txt = txt.replace(/(^|\s)([QABCDEFG]\))/g, '\n$2');

    // handle cases like ")A)" or ")A) " without a space
    txt = txt.replace(/\)\s*([A-GQ]\))/g, ')\n$1');

    // replace multiple blank lines with double newline
    txt = txt.replace(/\n{2,}/g, '\n\n');

    // Trim and collapse spaces on each line
    const lines = txt.split('\n').map(l => l.replace(/\s+/g, ' ').trim());

    // Ensure token lines have trailing space after token marker
    const cleaned = lines.map(l => l.replace(/^([A-GQ]\))\s*/i, (m, p1) => `${p1} `));

    return cleaned.join('\n').trim();
  }

  function extractRawField(val) {
    if (val === null || val === undefined) return '';

    if (typeof val === 'string') {
      let s = val.trim();

      // If it's JSON encoded text, try to parse and extract preferred fields
      if ((s.startsWith('{') || s.startsWith('['))) {
        try {
          const parsed = JSON.parse(s);
          if (parsed && typeof parsed === 'object') {
            if (parsed.english && typeof parsed.english === 'string' && parsed.english.trim()) {
              return normalizeAlphaNotamText(stripSurroundingParens(parsed.english));
            }
            if (parsed.raw && typeof parsed.raw === 'string' && parsed.raw.trim()) {
              return normalizeAlphaNotamText(stripSurroundingParens(parsed.raw));
            }
            if (parsed.text && typeof parsed.text === 'string' && parsed.text.trim()) {
              return normalizeAlphaNotamText(stripSurroundingParens(parsed.text));
            }
            // fallback to pretty JSON
            return JSON.stringify(parsed, null, 2);
          }
        } catch (e) {
          // not JSON, continue
        }
      }

      const stripped = stripSurroundingParens(s);
      const looksLikeNotam = /NOTAM|Q\)|A\)|B\)|C\)|E\)/i.test(stripped) || /[A-Z0-9]+\/\d{2,4}\s+NOTAM/i.test(stripped);

      if (looksLikeNotam) {
        return normalizeAlphaNotamText(stripped);
      }
      return stripped.replace(/\s+/g, ' ').trim();
    }

    if (typeof val === 'object') {
      if (Array.isArray(val)) {
        if (val.every(v => typeof v === 'string')) {
          return val.map(v => normalizeAlphaNotamText(stripSurroundingParens(v))).join('\n\n');
        }
        try {
          const parts = val.map(it => (typeof it === 'string' ? normalizeAlphaNotamText(stripSurroundingParens(it)) : extractRawField(it)));
          return parts.join('\n\n');
        } catch {}
      }

      const preferred = ['english', 'raw', 'text', 'body', 'report', 'metar', 'taf', 'message', 'remarks'];
      for (const k of preferred) {
        if (val[k] && typeof val[k] === 'string' && val[k].trim()) {
          const candidate = stripSurroundingParens(val[k]);
          const looksLikeNotam = /NOTAM|Q\)|A\)|B\)|C\)|E\)/i.test(candidate) || /[A-Z0-9]+\/\d{2,4}\s+NOTAM/i.test(candidate);
          return looksLikeNotam ? normalizeAlphaNotamText(candidate) : candidate.replace(/\s+/g, ' ').trim();
        }
        if (val[k] && typeof val[k] === 'object') {
          const nested = extractRawField(val[k]);
          if (nested) return nested;
        }
      }

      // search one level deep for raw-like strings
      for (const k of Object.keys(val)) {
        const v = val[k];
        if (typeof v === 'string' && v.trim().length > 0) {
          if (/[Q\)A\)B\)C\)E\)]/.test(v) || /NOTAM/i.test(v)) {
            return normalizeAlphaNotamText(stripSurroundingParens(v));
          }
        }
      }

      try {
        return JSON.stringify(val, null, 2);
      } catch (err) {
        return String(val);
      }
    }

    return String(val);
  }

  function parseNotamDateTime(dateTimeStr) {
    if (!dateTimeStr || /PERM/i.test(dateTimeStr)) return null;
    const match = String(dateTimeStr).match(/(\d{10})/);
    if (match) {
      const dt = match[1];
      const year = 2000 + parseInt(dt.substring(0, 2), 10);
      const month = parseInt(dt.substring(2, 4), 10) - 1;
      const day = parseInt(dt.substring(4, 6), 10);
      const hour = parseInt(dt.substring(6, 8), 10);
      const minute = parseInt(dt.substring(8, 10), 10);
      try {
        // Return ISO string (UTC)
        return new Date(Date.UTC(year, month, day, hour, minute)).toISOString();
      } catch {
        return null;
      }
    }
    return null;
  }

  // ----------------------
  // End helpers
  // ----------------------

  try {
    const upicao = icao.toUpperCase();
    const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${upicao}&responseFormat=geoJson&pageSize=1000`;
    
    console.log(`[API] Fetching NOTAMs for ${upicao} from FAA: ${faaUrl}`);

    const faaResp = await fetch(faaUrl, {
      headers: {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (!faaResp.ok) {
      console.error(`[API] FAA API returned ${faaResp.status}: ${faaResp.statusText}`);
      if (faaResp.status === 429) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
      // For server 5xx/4xx, continue to attempt fallback for Canadian ICAOs only
      if (!(upicao[0] === 'C')) {
        return res.status(faaResp.status).json({ error: `FAA API error: ${faaResp.status} ${faaResp.statusText}` });
      }
      console.warn(`[API] FAA failed but ICAO ${upicao} is Canadian — will attempt NAV CANADA CFPS fallback`);
    }

    let data = null;
    try {
      data = faaResp.ok ? await faaResp.json() : null;
    } catch (e) {
      console.warn('[API] Failed to parse FAA response as JSON, continuing to fallback if needed', e);
      data = null;
    }

    const faaItems = data?.items || [];

    // If FAA returned items, process them normally
    let parsed = [];
    if (faaItems.length > 0) {
      console.log(`[API] Received ${faaItems.length} items from FAA API`);
      parsed = faaItems.map(item => {
        const core = item.properties?.coreNOTAMData?.notam || {};
        const translation = (item.properties?.coreNOTAMData?.notamTranslation || [])[0] || {};
        const icaoLocation = core.icaoLocation || core.location || upicao;
        
        return {
          number: core.number || '',
          type: core.type || '',
          classification: core.classification || '',
          icao: icaoLocation,
          location: core.location || icaoLocation,
          validFrom: core.effectiveStart || core.issued || '',
          validTo: core.effectiveEnd || '',
          summary: translation.simpleText || translation.formattedText || core.text || '',
          body: core.text || translation.formattedText || '',
          qLine: core.qLine || (translation.formattedText?.split('\n')[0]) || '',
          source: 'FAA'
        };
      });
    } else {
      // FAA returned no items (or parsing failed). If Canadian ICAO, attempt NAV CANADA CFPS fallback.
      if (upicao[0] === 'C') {
        try {
          const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${upicao}&alpha=notam`;
          console.log(`[API] FAA returned no NOTAMs for ${upicao}. Fetching NAV CANADA CFPS: ${navUrl}`);

          const navResp = await fetch(navUrl, {
            headers: { 'Accept': 'application/json, text/plain, */*' },
            timeout: 10000
          });

          if (!navResp.ok) {
            console.warn(`[API] NAV CANADA returned ${navResp.status}: ${navResp.statusText}`);
          } else {
            let navData = null;
            const rawText = await navResp.text();

            try {
              navData = JSON.parse(rawText);
            } catch (e) {
              // Not JSON — we'll fallback to raw-text processing below
              navData = null;
            }

            const navItems = [];

            if (navData) {
              if (Array.isArray(navData)) {
                navData.forEach(it => navItems.push(it));
              } else if (navData.notam && Array.isArray(navData.notam)) {
                navData.notam.forEach(it => navItems.push(it));
              } else if (navData.Alpha && Array.isArray(navData.Alpha)) {
                navData.Alpha.forEach(it => navItems.push(it));
              } else {
                const arrays = Object.values(navData).filter(v => Array.isArray(v) && v.length > 0);
                if (arrays.length > 0) {
                  arrays[0].forEach(it => navItems.push(it));
                } else {
                  navItems.push(navData);
                }
              }

              // Normalize each nav item using the extractRawField helper and token parsing
              navItems.forEach(it => {
                const rawCandidate = extractRawField(it.raw || it.notam || it.text || it.english || it);
                const cleaned = normalizeAlphaNotamText(rawCandidate || '');

                // split into lines
                const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

                // helpers to find token lines (we normalized, so tokens should be on their own lines)
                const findLine = prefix => lines.find(l => l.toUpperCase().startsWith(prefix)) || '';
                const qLine = findLine('Q)') || '';
                const aLine = (findLine('A)') || '').replace(/^A\)\s*/i, '').trim();
                const bLine = (findLine('B)') || '').replace(/^B\)\s*/i, '').trim();
                const cLine = (findLine('C)') || '').replace(/^C\)\s*/i, '').trim();
                const dLine = (findLine('D)') || '').replace(/^D\)\s*/i, '').trim();
                const eLine = (findLine('E)') || '').replace(/^E\)\s*/i, '').trim();
                const fLine = (findLine('F)') || '').replace(/^F\)\s*/i, '').trim();
                const gLine = (findLine('G)') || '').replace(/^G\)\s*/i, '').trim();

                // try extract number from top lines or item fields
                let number = it.id || it.notamId || it.number || '';
                if (!number) {
                  const first = lines[0] || '';
                  const m = first.match(/([A-Z0-9]+\/\d{2,4})/i);
                  if (m) number = m[1];
                }

                // For body, prefer from Q) onward (Q) included) or fallback to whole cleaned text
                let body = '';
                const qIndex = lines.findIndex(l => /^Q\)/i.test(l));
                if (qIndex >= 0) {
                  body = lines.slice(qIndex).join('\n');
                } else {
                  body = cleaned;
                }

                const validFromIso = parseNotamDateTime(bLine) || (it.start ? parseNotamDateTime(it.start) : null) || bLine || '';
                const validToIso = parseNotamDateTime(cLine) || (it.end ? parseNotamDateTime(it.end) : null) || cLine || '';

                parsed.push({
                  number: number || '',
                  type: it.type || '',
                  classification: it.classification || '',
                  icao: aLine || upicao,
                  location: aLine || upicao,
                  validFrom: validFromIso || '',
                  validTo: validToIso || '',
                  summary: eLine || lines[lines.length - 1] || '',
                  body: body || cleaned || '',
                  qLine: qLine || '',
                  rawText: cleaned || rawCandidate || '',
                  aLine: aLine || '',
                  bLine: bLine || '',
                  cLine: cLine || '',
                  dLine: dLine || '',
                  eLine: eLine || '',
                  fLine: fLine || '',
                  gLine: gLine || '',
                  isPermanent: (/PERM/i.test(cLine) || /PERM/i.test(it.c || '')) || false,
                  source: 'NAVCAN'
                });
              });
            } else {
              // navData not JSON - fallback: try to split rawText into chunks and normalize each chunk
              const chunks = rawText.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
              if (chunks.length === 0 && rawText.trim()) chunks.push(rawText.trim());

              chunks.forEach((chunk, idx) => {
                const cleaned = normalizeAlphaNotamText(extractRawField(chunk));
                const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

                const findLine = prefix => lines.find(l => l.toUpperCase().startsWith(prefix)) || '';
                const qLine = findLine('Q)') || '';
                const aLine = (findLine('A)') || '').replace(/^A\)\s*/i, '').trim();
                const bLine = (findLine('B)') || '').replace(/^B\)\s*/i, '').trim();
                const cLine = (findLine('C)') || '').replace(/^C\)\s*/i, '').trim();
                const eLine = (findLine('E)') || '').replace(/^E\)\s*/i, '').trim();

                const m = chunk.match(/([A-Z0-9]+\/\d{2,4})/i);
                const number = m ? m[1] : `${upicao}-NAVCAN-${idx+1}`;

                const body = (qLine ? lines.slice(lines.findIndex(l => /^Q\)/i.test(l))).join('\n') : cleaned);

                const validFromIso = parseNotamDateTime(bLine) || '';
                const validToIso = parseNotamDateTime(cLine) || '';

                parsed.push({
                  number,
                  type: '',
                  classification: '',
                  icao: aLine || upicao,
                  location: aLine || upicao,
                  validFrom: validFromIso || '',
                  validTo: validToIso || '',
                  summary: eLine || lines[lines.length - 1] || '',
                  body: body || cleaned || '',
                  qLine: qLine || '',
                  rawText: cleaned || '',
                  aLine: aLine || '',
                  bLine: bLine || '',
                  cLine: cLine || '',
                  dLine: '',
                  eLine: eLine || '',
                  fLine: '',
                  gLine: '',
                  isPermanent: /PERM/i.test(cLine),
                  source: 'NAVCAN'
                });
              });
            }
          }
        } catch (navErr) {
          console.error(`[API] Error fetching NAV CANADA CFPS for ${upicao}:`, navErr);
        }
      } else {
        console.log(`[API] FAA returned no NOTAMs for ${upicao} and ICAO is not Canadian — returning empty list`);
      }
    }

    // Filter for currently valid or future NOTAMs only
    const now = new Date();
    parsed = parsed.filter(n => {
      if (!n.validTo) return true; // keep if end time missing
      try {
        const t = new Date(n.validTo);
        if (isNaN(t.getTime())) return true;
        return t >= now;
      } catch {
        return true;
      }
    });

    // Dispatcher-priority sort:
    parsed.sort((a, b) => {
      const isClosureA = /clsd|closed/i.test(a.summary || a.body || '');
      const isRscA = /rsc/i.test(a.summary || a.body || '');
      const isCrfiA = /crfi/i.test(a.summary || a.body || '');

      const isClosureB = /clsd|closed/i.test(b.summary || b.body || '');
      const isRscB = /rsc/i.test(b.summary || b.body || '');
      const isCrfiB = /crfi/i.test(b.summary || b.body || '');

      // Priority 1: Runway closure
      if (isClosureA && !isClosureB) return -1;
      if (!isClosureA && isClosureB) return 1;

      // Priority 2: RSC
      if (isRscA && !isRscB) return -1;
      if (!isRscA && isRscB) return 1;

      // Priority 3: CRFI
      if (isCrfiA && !isCrfiB) return -1;
      if (!isCrfiA && isCrfiB) return 1;

      // Then, most recent validFrom first
      try {
        const ta = new Date(a.validFrom || 0).getTime() || 0;
        const tb = new Date(b.validFrom || 0).getTime() || 0;
        return tb - ta;
      } catch {
        return 0;
      }
    });

    // Limit to 50 NOTAMs
    parsed = parsed.slice(0, 50);

    console.log(`[API] Sending ${parsed.length} processed NOTAMs for ${upicao}`);
    
    // Set cache headers
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600'); // 5 min cache, 10 min stale
    
    return res.status(200).json(parsed);

  } catch (error) {
    console.error(`[API] Error fetching NOTAMs for ${req.query.icao}:`, error);
    
    if (error.name === 'AbortError' || (error.message && error.message.includes('timeout'))) {
      return res.status(504).json({ error: 'Request timeout' });
    }
    
    return res.status(500).json({ 
      error: 'Failed to fetch NOTAMs', 
      details: error.message 
    });
  }
}
