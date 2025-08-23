// api/notams.js - Vercel serverless function for NOTAM fetching
// - Require FAA credentials only for non-Canadian ICAOs
// - If FAA credentials are missing and ICAO starts with 'C', skip FAA and use NAV CANADA fallback
// - Preserve existing normalization and fallback logic

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

  const upicao = icao.toUpperCase();
  const CLIENT_ID = process.env.REACT_APP_FAA_CLIENT_ID;
  const CLIENT_SECRET = process.env.REACT_APP_FAA_API_KEY;

  // Require FAA credentials only for non-Canadian ICAOs
  if ((!CLIENT_ID || !CLIENT_SECRET) && upicao[0] !== 'C') {
    console.error('Missing FAA API credentials for non-Canadian ICAO requests');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    let parsed = [];

    // Attempt FAA fetch only when credentials are available
    let faaItems = [];
    if (CLIENT_ID && CLIENT_SECRET) {
      const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${upicao}&responseFormat=geoJson&pageSize=1000`;
      console.log(`[API] Fetching NOTAMs for ${upicao} from FAA: ${faaUrl}`);

      try {
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
          // If FAA failed but ICAO is Canadian, we'll fall back later to NAV CANADA
          if (upicao[0] !== 'C') {
            return res.status(faaResp.status).json({ error: `FAA API error: ${faaResp.status} ${faaResp.statusText}` });
          }
          console.warn(`[API] FAA failed for ${upicao} — will attempt NAV CANADA fallback`);
        } else {
          // parse FAA JSON safely
          try {
            const data = await faaResp.json();
            faaItems = data?.items || [];
          } catch (err) {
            console.warn('[API] Failed to parse FAA response as JSON:', err);
            faaItems = [];
          }
        }
      } catch (err) {
        console.error('[API] Error fetching FAA API:', err);
        if (upicao[0] !== 'C') {
          return res.status(502).json({ error: 'Failed to reach FAA API' });
        }
        // else fall through to NAV CANADA
      }
    } else {
      // No FAA credentials
      if (upicao[0] === 'C') {
        console.warn(`[API] FAA credentials missing. Skipping FAA for Canadian ICAO ${upicao} and using NAV CANADA fallback`);
      } else {
        // already handled above, but guard here as well
        console.error('Missing FAA API credentials for non-Canadian ICAO requests');
        return res.status(500).json({ error: 'Server configuration error' });
      }
    }

    // If FAA provided items, normalize them
    if (faaItems.length > 0) {
      console.log(`[API] Received ${faaItems.length} items from FAA API`);
      parsed = faaItems.map(item => {
        const core = item.properties?.coreNOTAMData?.notam || {};
        const translation = (item.properties?.coreNOTAMData?.notamTranslation || [])[0] || {};
        const icaoLocation = core.icaoLocation || core.location || upicao;
        const rawBody = translation.formattedText || translation.simpleText || core.text || '';
        return {
          number: core.number || '',
          type: core.type || '',
          classification: core.classification || '',
          icao: icaoLocation,
          location: core.location || icaoLocation,
          validFrom: core.effectiveStart || core.issued || '',
          validTo: core.effectiveEnd || '',
          summary: translation.simpleText || translation.formattedText || core.text || '',
          body: rawBody,
          qLine: core.qLine || (translation.formattedText?.split('\n')[0]) || '',
        };
      });
    } else {
      // FAA returned no items or we skipped FAA — if Canadian ICAO, try NAV CANADA CFPS fallback
      if (upicao[0] === 'C') {
        try {
          const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${upicao}&alpha=notam`;
          console.log(`[API] Fetching NAV CANADA CFPS for ${upicao}: ${navUrl}`);

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
            } catch {
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

              navItems.forEach(it => {
                let body = '';
                if (typeof it === 'string') {
                  body = it;
                } else {
                  if (it.raw && typeof it.raw === 'string') body = it.raw;
                  else if (it.notam && typeof it.notam === 'string') body = it.notam;
                  else if (it.text && typeof it.text === 'string') body = it.text;
                  else if (it.body && typeof it.body === 'string') body = it.body;
                  else if (it.description && typeof it.description === 'string') body = it.description;
                  else if (it.raw && typeof it.raw === 'object') body = JSON.stringify(it.raw);
                  else if (it.body && typeof it.body === 'object') body = JSON.stringify(it.body);
                  else body = JSON.stringify(it);
                }

                const trimmed = (typeof body === 'string') ? body.trim() : '';
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                  try {
                    const parsedInner = JSON.parse(trimmed);
                    if (parsedInner && typeof parsedInner === 'object') {
                      if (parsedInner.raw && typeof parsedInner.raw === 'string') {
                        body = parsedInner.raw;
                      } else if (parsedInner.notam && typeof parsedInner.notam === 'string') {
                        body = parsedInner.notam;
                      } else if (parsedInner.text && typeof parsedInner.text === 'string') {
                        body = parsedInner.text;
                      } else {
                        body = JSON.stringify(parsedInner, null, 2);
                      }
                    }
                  } catch {
                    // keep original string
                  }
                }

                const number = it.id || it.notamId || it.number || '';
                const validFrom = it.start || it.begin || it.validFrom || '';
                const validTo = it.end || it.finish || it.validTo || '';
                const location = it.site || it.siteCode || upicao;

                parsed.push({
                  number,
                  type: it.type || '',
                  classification: it.classification || '',
                  icao: location || upicao,
                  location: location || upicao,
                  validFrom,
                  validTo,
                  summary: (typeof body === 'string' ? (body.split('\n')[0] || body) : ''),
                  body: typeof body === 'string' ? body : JSON.stringify(body),
                  qLine: it.qLine || ''
                });
              });
            } else {
              let processedRaw = rawText;
              try {
                const maybe = JSON.parse(rawText);
                if (maybe && typeof maybe === 'object') {
                  if (maybe.raw && typeof maybe.raw === 'string') {
                    processedRaw = maybe.raw;
                  } else {
                    processedRaw = JSON.stringify(maybe);
                  }
                }
              } catch {
                // not JSON - leave as-is
              }

              const chunks = processedRaw.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
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

      if (isClosureA && !isClosureB) return -1;
      if (!isClosureA && isClosureB) return 1;
      if (isRscA && !isRscB) return -1;
      if (!isRscA && isRscB) return 1;
      if (isCrfiA && !isCrfiB) return -1;
      if (!isCrfiA && isCrfiB) return 1;

      try {
        return new Date(b.validFrom || 0) - new Date(a.validFrom || 0);
      } catch {
        return 0;
      }
    });

    parsed = parsed.slice(0, 50);

    console.log(`[API] Sending ${parsed.length} processed NOTAMs for ${upicao}`);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
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
