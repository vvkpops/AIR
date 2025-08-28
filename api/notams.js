// api/notams.js - Vercel serverless function for NOTAM fetching
// Improved NAV CANADA CFPS fallback parsing:
// - Detects and parses JSON strings embedded in summary/body (including double-escaped JSON)
// - Prefer 'english' then 'raw' text when available
// - Unescapes "\n" sequences into real newlines
// - Preserves FAA path unchanged; CFPS parsing only used as fallback for Canadian ICAOs

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

            // Helper: attempt JSON.parse safely
            const tryParseJSON = (text) => {
              try {
                return JSON.parse(text);
              } catch (e) {
                return null;
              }
            };

            // Helper: try to extract a JSON substring that contains likely CFPS keys
            const extractJSONBlob = (text) => {
              const keyCandidates = ['"Alpha"', '"alpha"', '"notam"', '"notams"', '"raw"', '"english"'];
              const direct = tryParseJSON(text);
              if (direct) return direct;

              for (const key of keyCandidates) {
                const idx = text.indexOf(key);
                if (idx !== -1) {
                  const before = text.slice(0, idx);
                  const openIdx = before.lastIndexOf('{');
                  const arrOpenIdx = before.lastIndexOf('[');
                  const start = Math.max(openIdx, arrOpenIdx);
                  if (start === -1) continue;
                  const closeIdxObj = text.indexOf('}', idx);
                  const closeIdxArr = text.indexOf(']', idx);
                  const end = Math.max(closeIdxObj, closeIdxArr);
                  if (end === -1) continue;
                  const candidate = text.slice(start, end + 1);
                  const parsed = tryParseJSON(candidate);
                  if (parsed) return parsed;
                }
              }

              // double-encoded JSON inside a string
              const doubleQuotedJsonMatch = text.match(/"(\{(?:[^"\\]|\\.)*\})"/s);
              if (doubleQuotedJsonMatch) {
                const unescaped = doubleQuotedJsonMatch[1].replace(/\\"/g, '"');
                const parsed = tryParseJSON(unescaped);
                if (parsed) return parsed;
              }

              return null;
            };

            // Try parse rawText, fallback to extraction heuristics
            navData = tryParseJSON(rawText) || extractJSONBlob(rawText);

            const navItems = [];

            const pushNavItem = (it) => {
              if (!it) return;
              navItems.push(it);
            };

            if (navData) {
              // Normalize structures: arrays, wrappers (notam, Alpha, etc.)
              if (Array.isArray(navData)) {
                navData.forEach(it => pushNavItem(it));
              } else {
                const wrapperKeys = ['Alpha', 'alpha', 'notam', 'notams', 'NOTAM', 'NOTAMS', 'data', 'results', 'items', 'features'];
                let found = false;
                for (const k of wrapperKeys) {
                  if (navData[k]) {
                    if (Array.isArray(navData[k])) {
                      navData[k].forEach(it => pushNavItem(it));
                    } else if (typeof navData[k] === 'object') {
                      // some structures are { Alpha: { ... } } or { Alpha: [{...}] }
                      const inner = navData[k];
                      if (Array.isArray(inner)) {
                        inner.forEach(it => pushNavItem(it));
                      } else {
                        pushNavItem(inner);
                      }
                    }
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  const likelyNotam = ['raw','english','notam','text','body','description'];
                  const hasLikely = Object.keys(navData || {}).some(k => likelyNotam.includes(k.toLowerCase()));
                  if (hasLikely) {
                    pushNavItem(navData);
                  } else {
                    const arrays = Object.values(navData || {}).filter(v => Array.isArray(v) && v.length > 0);
                    if (arrays.length > 0) {
                      arrays[0].forEach(it => pushNavItem(it));
                    } else {
                      pushNavItem(navData);
                    }
                  }
                }
              }

              // Helper: robustly extract text from various shapes (string JSON, object, etc.)
              const extractTextFromValue = (val) => {
                if (!val && val !== 0) return '';
                // If object, prefer english/raw/body/text fields
                if (typeof val === 'object') {
                  if (typeof val.english === 'string' && val.english.trim()) return val.english.replace(/\\n/g, '\n');
                  if (typeof val.raw === 'string' && val.raw.trim()) return val.raw.replace(/\\n/g, '\n');
                  if (typeof val.body === 'string' && val.body.trim()) return val.body.replace(/\\n/g, '\n');
                  if (typeof val.text === 'string' && val.text.trim()) return val.text.replace(/\\n/g, '\n');
                  // fallback to JSON string
                  try { return JSON.stringify(val); } catch (e) { return String(val); }
                }

                // If string, detect JSON-like string (possibly double-escaped)
                if (typeof val === 'string') {
                  let s = val.trim();

                  // If it looks like a JSON object or array, try to parse
                  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                    const p = tryParseJSON(s);
                    if (p) return extractTextFromValue(p);
                  }

                  // If it's a quoted JSON inside a string (common double-encoded), unescape then parse
                  // Remove wrapping quotes (e.g. "\"{...}\"")
                  if (s.startsWith('"') && s.endsWith('"')) {
                    s = s.slice(1, -1);
                    s = s.replace(/\\"/g, '"');
                    const p2 = tryParseJSON(s);
                    if (p2) return extractTextFromValue(p2);
                  }

                  // Try to find JSON-like substring
                  const jsonSubstringMatch = s.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
                  if (jsonSubstringMatch) {
                    const candidate = jsonSubstringMatch[1];
                    const p3 = tryParseJSON(candidate);
                    if (p3) return extractTextFromValue(p3);
                  }

                  // If string contains keys like "raw" or "english" but isn't strict JSON, attempt manual extraction
                  // e.g. "\"raw\" : \"(...\\n...)\""
                  const rawMatch = s.match(/"raw"\s*:\s*"([\s\S]*?)"/);
                  if (rawMatch) return rawMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                  const engMatch = s.match(/"english"\s*:\s*"([\s\S]*?)"/);
                  if (engMatch) return engMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');

                  // Replace escaped newlines and escaped quotes, return
                  return s.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                }

                // Fallback to string
                return String(val);
              };

              // Map navItems to normalized parsed entries
              navItems.forEach(it => {
                // choose candidate fields (body preferred, then summary, then raw/english)
                const candidateField = it.body || it.summary || it.raw || it.english || it.text || it.description || it.rawText || it.notam || it.notice || '';
                const fullText = extractTextFromValue(candidateField);

                // Attempt to extract Q-line if present in object or text
                let qLine = '';
                if (it.qLine) qLine = it.qLine;
                else if (it.q) qLine = it.q;
                else {
                  // try to extract Q) line from the fullText
                  const qMatch = fullText.match(/(^|\n)\s*(Q\)[^\n]*)/i);
                  if (qMatch) qLine = qMatch[2].trim();
                }

                const number = (it.id || it.notamId || it.number || it.noticeNumber || it.noticeid || it.header || '') + '';
                const validFrom = it.start || it.begin || it.validFrom || it.from || it.b || it.B || '';
                const validTo = it.end || it.finish || it.validTo || it.to || it.c || it.C || '';
                const location = it.site || it.siteCode || it.location || it.aerodrome || upicao;

                const bodyText = fullText || '';
                const summaryText = typeof bodyText === 'string' && bodyText.length ? bodyText.split('\n')[0] : '';

                parsed.push({
                  number: number || (location ? `${location}-NAVCAN-${parsed.length+1}` : `${upicao}-NAVCAN-${parsed.length+1}`),
                  type: it.type || it.category || 'notam',
                  classification: it.classification || it.priority || '',
                  icao: location || upicao,
                  location: location || upicao,
                  validFrom: validFrom || '',
                  validTo: validTo || '',
                  summary: summaryText,
                  body: bodyText,
                  rawText: bodyText,
                  qLine: qLine || ''
                });
              });
            } else {
              // navData was not JSON — use raw text fallback: try to extract NOTAM blocks in plain text/HTML
              let cleaned = rawText;
              const preMatch = cleaned.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
              if (preMatch && preMatch[1]) {
                cleaned = preMatch[1];
              } else {
                cleaned = cleaned.replace(/<\/?[^>]+(>|$)/g, '\n');
              }

              cleaned = cleaned.replace(/\\n/g, '\n').replace(/\r/g, '\n');

              const chunks = cleaned.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
              if (chunks.length > 0) {
                chunks.forEach((chunk, idx) => {
                  parsed.push({
                    number: `${upicao}-NAVCAN-${idx+1}`,
                    type: 'notam',
                    classification: '',
                    icao: upicao,
                    location: upicao,
                    validFrom: '',
                    validTo: '',
                    summary: chunk.split('\n')[0] || '',
                    body: chunk,
                    rawText: chunk,
                    qLine: ''
                  });
                });
              } else if (cleaned.trim()) {
                parsed.push({
                  number: `${upicao}-NAVCAN-1`,
                  type: 'notam',
                  classification: '',
                  icao: upicao,
                  location: upicao,
                  validFrom: '',
                  validTo: '',
                  summary: cleaned.split('\n')[0] || '',
                  body: cleaned,
                  rawText: cleaned,
                  qLine: ''
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
        return new Date(n.validTo) >= now;
      } catch {
        return true;
      }
    });

    // Dispatcher-priority sort:
    parsed.sort((a, b) => {
      const isClosureA = /clsd|closed/i.test(a.summary || '');
      const isRscA = /rsc/i.test(a.summary || '');
      const isCrfiA = /crfi/i.test(a.summary || '');

      const isClosureB = /clsd|closed/i.test(b.summary || '');
      const isRscB = /rsc/i.test(b.summary || '');
      const isCrfiB = /crfi/i.test(b.summary || '');

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
        return new Date(b.validFrom || 0) - new Date(a.validFrom || 0);
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
