// api/notams.js - Vercel serverless function for NOTAM fetching
// Updated: more robust NAV CANADA CFPS fallback parsing when FAA returns no NOTAMs for Canadian ICAOs

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
              // Look for an object or array that contains "Alpha" or "notam" or "raw" keys
              const keyCandidates = ['"Alpha"', '"alpha"', '"notam"', '"notams"', '"raw"', '"english"'];
              // quick check: if text already contains one of the keys and is valid JSON, just parse it
              const direct = tryParseJSON(text);
              if (direct) return direct;

              // Attempt to find substring bounded by braces that contains a candidate key
              for (const key of keyCandidates) {
                const idx = text.indexOf(key);
                if (idx !== -1) {
                  // find opening brace before idx
                  const before = text.slice(0, idx);
                  const openIdx = before.lastIndexOf('{');
                  const arrOpenIdx = before.lastIndexOf('[');
                  const start = Math.max(openIdx, arrOpenIdx);
                  if (start === -1) continue;
                  // find a closing brace after idx
                  const after = text.slice(idx);
                  const closeIdxObj = text.indexOf('}', idx);
                  const closeIdxArr = text.indexOf(']', idx);
                  const end = Math.max(closeIdxObj, closeIdxArr);
                  if (end === -1) continue;
                  const candidate = text.slice(start, end + 1);
                  const parsed = tryParseJSON(candidate);
                  if (parsed) return parsed;
                }
              }

              // As a last attempt, try to unescape double-encoded JSON inside a string
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
              // If it wraps fields under 'item' or similar arrays, unwrap common wrappers
              navItems.push(it);
            };

            if (navData) {
              // Normalize structures: arrays, wrappers (notam, Alpha, Alpha.Notam list, etc.)
              if (Array.isArray(navData)) {
                navData.forEach(it => pushNavItem(it));
              } else {
                // Known wrapper keys to inspect (in order)
                const wrapperKeys = ['Alpha', 'alpha', 'notam', 'notams', 'NOTAM', 'NOTAMS', 'data', 'results', 'items', 'features'];
                let found = false;
                for (const k of wrapperKeys) {
                  if (navData[k]) {
                    if (Array.isArray(navData[k])) {
                      navData[k].forEach(it => pushNavItem(it));
                    } else if (typeof navData[k] === 'object') {
                      // some structures are { Alpha: { ... } } or { Alpha: [{...}] }
                      if (Array.isArray(navData[k].Alpha)) {
                        navData[k].Alpha.forEach(it => pushNavItem(it));
                      } else {
                        pushNavItem(navData[k]);
                      }
                    }
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  // If object already looks like a NOTAM entry with keys like raw/english, push it
                  const likelyNotam = ['raw','english','notam','text','body','description'];
                  const hasLikely = Object.keys(navData).some(k => likelyNotam.includes(k.toLowerCase()));
                  if (hasLikely) {
                    pushNavItem(navData);
                  } else {
                    // find the first array value in the object
                    const arrays = Object.values(navData).filter(v => Array.isArray(v) && v.length > 0);
                    if (arrays.length > 0) {
                      arrays[0].forEach(it => pushNavItem(it));
                    } else {
                      // last resort: treat the object itself as a single item
                      pushNavItem(navData);
                    }
                  }
                }
              }

              // Map navItems to normalized parsed entries
              navItems.forEach(it => {
                // prefer fields in order of likelihood
                // CFPS often uses fields like: raw, english, notam, text, description
                const getStr = (obj, keys) => {
                  for (const k of keys) {
                    if (!obj) continue;
                    if (obj[k] && typeof obj[k] === 'string') return obj[k];
                    // some values can be nested under obj[k].english etc
                    if (obj[k] && typeof obj[k] === 'object') {
                      // try common nested fields
                      if (typeof obj[k].english === 'string') return obj[k].english;
                      if (typeof obj[k].raw === 'string') return obj[k].raw;
                    }
                  }
                  return '';
                };

                const raw = getStr(it, ['raw', 'english', 'notam', 'text', 'body', 'description', 'rawText']);
                const number = (it.id || it.notamId || it.number || it.noticeNumber || it.noticeid || it.header || '') + '';
                const validFrom = it.start || it.begin || it.validFrom || it.from || '';
                const validTo = it.end || it.finish || it.validTo || it.to || '';
                const location = it.site || it.siteCode || it.location || it.aerodrome || upicao;
                const qLine = it.q || it.qLine || '';

                parsed.push({
                  number: number || (location ? `${location}-NAVCAN-${parsed.length+1}` : `${upicao}-NAVCAN-${parsed.length+1}`),
                  type: it.type || it.category || '',
                  classification: it.classification || it.priority || '',
                  icao: location || upicao,
                  location: location || upicao,
                  validFrom: validFrom || '',
                  validTo: validTo || '',
                  summary: typeof raw === 'string' ? (raw.split('\n')[0] || raw) : '',
                  body: typeof raw === 'string' ? raw : JSON.stringify(raw),
                  qLine: qLine || ''
                });
              });
            } else {
              // navData was not JSON — use raw text fallback: try to extract NOTAM blocks in plain text/HTML
              // Remove surrounding HTML tags but keep plaintext inside <pre> if present
              let cleaned = rawText;
              // Attempt to extract <pre> blocks (CFPS sometimes returns HTML with <pre>)
              const preMatch = cleaned.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
              if (preMatch && preMatch[1]) {
                cleaned = preMatch[1];
              } else {
                // Strip tags conservatively
                cleaned = cleaned.replace(/<\/?[^>]+(>|$)/g, '\n');
              }

              // Replace multiple escaped newline tokens
              cleaned = cleaned.replace(/\\n/g, '\n').replace(/\r/g, '\n');

              const chunks = cleaned.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
              if (chunks.length > 0) {
                chunks.forEach((chunk, idx) => {
                  parsed.push({
                    number: `${upicao}-NAVCAN-${idx+1}`,
                    type: '',
                    classification: '',
                    icao: upicao,
                    location: upicao,
                    validFrom: '',
                    validTo: '',
                    summary: chunk.split('\n')[0] || '',
                    body: chunk,
                    qLine: ''
                  });
                });
              } else if (cleaned.trim()) {
                parsed.push({
                  number: `${upicao}-NAVCAN-1`,
                  type: '',
                  classification: '',
                  icao: upicao,
                  location: upicao,
                  validFrom: '',
                  validTo: '',
                  summary: cleaned.split('\n')[0] || '',
                  body: cleaned,
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
