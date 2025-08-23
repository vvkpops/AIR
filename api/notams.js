// api/notams.js - Vercel serverless function for NOTAM fetching
// Updated: improved NAV CANADA CFPS fallback with NOTAM text cleanup/normalization

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
            // Try to parse JSON; some endpoints may respond with JSON directly or with text that contains JSON
            let navData = null;
            const rawText = await navResp.text();

            try {
              navData = JSON.parse(rawText);
            } catch (e) {
              // Not JSON — attempt to extract JSON blob from HTML or fallback to returning raw text as a single NOTAM
              // Common NAV CANADA responses are JSON, but guard against HTML
              console.warn('[API] NAV CANADA response is not JSON; will attempt simple scraping fallback');
            }

            const navItems = [];

            if (navData) {
              // Attempt to normalize common shapes
              // Possible shapes: array of objects, { notam: [...] }, { Alpha: [...] }, etc.
              if (Array.isArray(navData)) {
                navData.forEach(it => navItems.push(it));
              } else if (navData.notam && Array.isArray(navData.notam)) {
                navData.notam.forEach(it => navItems.push(it));
              } else if (navData.Alpha && Array.isArray(navData.Alpha)) {
                navData.Alpha.forEach(it => navItems.push(it));
              } else {
                // attempt to find array values in object
                const arrays = Object.values(navData).filter(v => Array.isArray(v) && v.length > 0);
                if (arrays.length > 0) {
                  arrays[0].forEach(it => navItems.push(it));
                } else {
                  // last resort: treat the object itself as one item
                  navItems.push(navData);
                }
              }

              // Helper: clean and normalize NAV CANADA NOTAM text into structured fields
              const cleanNavNotam = (item, fallbackRaw = '') => {
                // Prefer explicit raw fields if available
                const raw = (item.raw || item.notam || item.text || item.description || fallbackRaw || '').replace(/\r/g,'').trim();

                // Remove outer parentheses that sometimes wrap whole payload, and trim
                let txt = raw.replace(/^\(+/, '').replace(/\)+$/, '').trim();

                // Some payloads start with "H3902/25 NOTAMN" inside parentheses - keep number if present
                // Split into lines and normalize
                const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);

                // If the data arrived as a single-line with embedded \n escaped, try to unescape common sequences
                if (lines.length === 1 && lines[0].includes('\\n')) {
                  txt = txt.replace(/\\n/g, '\n');
                }

                const normalizedLines = txt.split('\n').map(l => l.trim()).filter(Boolean);

                // Extract common NOTAM markers:
                const findLine = (prefix) => normalizedLines.find(l => l.toUpperCase().startsWith(prefix));
                const qLine = findLine('Q)') || '';
                const aLine = findLine('A)') || '';
                const bLine = findLine('B)') || '';
                const cLine = findLine('C)') || '';
                const dLine = findLine('D)') || '';
                const eLine = findLine('E)') || '';
                const fLine = findLine('F)') || '';
                const gLine = findLine('G)') || '';

                // Attempt to extract NOTAM number from first line or from a leading token like H3902/25
                let number = item.id || item.notamId || item.number || '';
                if (!number) {
                  const first = normalizedLines[0] || '';
                  const m = first.match(/([A-Z0-9]+\/\d{2,4})/i);
                  if (m) number = m[1];
                }

                // Determine summary and body: prefer E) line for user-facing description
                const summary = eLine ? eLine.replace(/^E\)\s*/i, '') : (normalizedLines[normalizedLines.length - 1] || '');
                // Compose a cleaned body: start from first Q) or from first line
                let body = '';
                const startIndex = normalizedLines.findIndex(l => /^Q\)/i.test(l));
                if (startIndex >= 0) {
                  body = normalizedLines.slice(startIndex).join('\n');
                } else {
                  body = normalizedLines.join('\n');
                }

                // Simple validFrom/validTo extraction - keep raw B/C content so downstream can parse if needed
                const validFrom = bLine ? bLine.replace(/^B\)\s*/i, '').trim() : (item.start || item.begin || '');
                const validTo = cLine ? cLine.replace(/^C\)\s*/i, '').trim() : (item.end || item.finish || '');

                return {
                  number: number || '',
                  qLine,
                  aLine: aLine.replace(/^A\)\s*/i, '').trim() || '',
                  bLine: bLine.replace(/^B\)\s*/i, '').trim() || '',
                  cLine: cLine.replace(/^C\)\s*/i, '').trim() || '',
                  dLine: dLine.replace(/^D\)\s*/i, '').trim() || '',
                  eLine: eLine.replace(/^E\)\s*/i, '').trim() || '',
                  fLine: fLine.replace(/^F\)\s*/i, '').trim() || '',
                  gLine: gLine.replace(/^G\)\s*/i, '').trim() || '',
                  rawText: body,
                  summary: summary,
                  body: body,
                  validFrom,
                  validTo,
                  isPermanent: /PERM/i.test(cLine || item.c || item.validTo || '')
                };
              };

              navItems.forEach(it => {
                const normalized = cleanNavNotam(it, rawText);
                parsed.push({
                  number: normalized.number,
                  type: it.type || '',
                  classification: it.classification || '',
                  icao: normalized.aLine || upicao,
                  location: normalized.aLine || upicao,
                  validFrom: normalized.validFrom || '',
                  validTo: normalized.validTo || '',
                  summary: normalized.summary || '',
                  body: normalized.body || normalized.rawText || '',
                  qLine: normalized.qLine || '',
                  rawText: normalized.rawText || '',
                  // include parsed NOTAM lines for richer downstream UI
                  aLine: normalized.aLine || '',
                  bLine: normalized.bLine || '',
                  cLine: normalized.cLine || '',
                  dLine: normalized.dLine || '',
                  eLine: normalized.eLine || '',
                  fLine: normalized.fLine || '',
                  gLine: normalized.gLine || '',
                  isPermanent: normalized.isPermanent || false,
                  source: 'NAVCAN'
                });
              });
            } else {
              // navData was not JSON — use raw text fallback: try to find blocks separated by double newlines
              const chunks = rawText.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
              if (chunks.length > 0) {
                chunks.forEach((chunk, idx) => {
                  // Clean chunk similarly to JSON path
                  const fakeItem = { raw: chunk };
                  const normalized = (() => {
                    const raw = chunk.replace(/\r/g,'').replace(/^\(+/, '').replace(/\)+$/, '').trim();
                    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
                    const qLine = lines.find(l => /^Q\)/i.test(l)) || '';
                    const eLine = lines.find(l => /^E\)/i.test(l)) || '';
                    const aLine = lines.find(l => /^A\)/i.test(l)) || '';
                    const cLine = lines.find(l => /^C\)/i.test(l)) || '';
                    const bLine = lines.find(l => /^B\)/i.test(l)) || '';
                    const m = raw.match(/([A-Z0-9]+\/\d{2,4})/i);
                    return {
                      number: m ? m[1] : `${upicao}-NAVCAN-${idx+1}`,
                      qLine,
                      aLine: aLine.replace(/^A\)\s*/i, '').trim() || upicao,
                      bLine: bLine.replace(/^B\)\s*/i, '').trim() || '',
                      cLine: cLine.replace(/^C\)\s*/i, '').trim() || '',
                      eLine: eLine.replace(/^E\)\s*/i, '').trim() || lines[lines.length-1] || '',
                      rawText: raw,
                      body: raw,
                      validFrom: bLine.replace(/^B\)\s*/i, '').trim() || '',
                      validTo: cLine.replace(/^C\)\s*/i, '').trim() || '',
                      isPermanent: /PERM/i.test(cLine)
                    };
                  })();

                  parsed.push({
                    number: normalized.number,
                    type: '',
                    classification: '',
                    icao: upicao,
                    location: normalized.aLine || upicao,
                    validFrom: normalized.validFrom || '',
                    validTo: normalized.validTo || '',
                    summary: normalized.eLine || '',
                    body: normalized.body || normalized.rawText || '',
                    qLine: normalized.qLine || '',
                    rawText: normalized.rawText || '',
                    aLine: normalized.aLine || '',
                    bLine: normalized.bLine || '',
                    cLine: normalized.cLine || '',
                    dLine: '',
                    eLine: normalized.eLine || '',
                    fLine: '',
                    gLine: '',
                    isPermanent: normalized.isPermanent || false,
                    source: 'NAVCAN'
                  });
                });
              }
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
        // keep if validTo can't be parsed (string tokens like "PERM")
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
    
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return res.status(504).json({ error: 'Request timeout' });
    }
    
    return res.status(500).json({ 
      error: 'Failed to fetch NOTAMs', 
      details: error.message 
    });
  }
}
