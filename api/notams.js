// api/notams.js - Vercel serverless function for NOTAM fetching
// Updated: Simplified CFPS JSON parsing for Canadian NOTAMs

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

  // Simplified function to parse CFPS NOTAM JSON strings
  const parseCFPSNotamText = (jsonString) => {
    if (!jsonString || typeof jsonString !== 'string') return jsonString;
    
    // If it doesn't look like JSON, return as-is
    if (!jsonString.includes('"raw"') && !jsonString.includes('"english"')) {
      return jsonString;
    }
    
    try {
      const parsed = JSON.parse(jsonString);
      
      // Priority order: english > raw (exclude french)
      if (parsed.english && typeof parsed.english === 'string' && parsed.english.trim()) {
        return parsed.english.replace(/\\n/g, '\n').trim();
      }
      if (parsed.raw && typeof parsed.raw === 'string' && parsed.raw.trim()) {
        return parsed.raw.replace(/\\n/g, '\n').trim();
      }
      
      return jsonString; // fallback
    } catch (e) {
      // Try regex extraction for malformed JSON
      const englishMatch = jsonString.match(/"english"\s*:\s*"([^"]+)"/);
      if (englishMatch) {
        return englishMatch[1].replace(/\\n/g, '\n').trim();
      }
      
      const rawMatch = jsonString.match(/"raw"\s*:\s*"([^"]+)"/);
      if (rawMatch) {
        return rawMatch[1].replace(/\\n/g, '\n').trim();
      }
      
      return jsonString; // fallback
    }
  };

  // Helper function to extract NOTAM number from text
  const extractNotamNumber = (text) => {
    if (!text) return '';
    
    // Look for patterns like "Q1101/25", "H4517/25", "V0876/25", etc.
    const match = text.match(/\b([A-Z]?\d+\/\d+)\b/);
    return match ? match[1] : '';
  };

  // Helper function to extract dates from NOTAM text
  const extractNotamDates = (text) => {
    if (!text) return { validFrom: '', validTo: '' };
    
    const dates = { validFrom: '', validTo: '' };
    
    // Look for B) and C) lines with dates
    const bMatch = text.match(/B\)\s*(\d{10})/);
    const cMatch = text.match(/C\)\s*(\d{10}|PERM)/);
    
    if (bMatch) {
      const dateStr = bMatch[1];
      if (dateStr.length === 10) {
        const year = 2000 + parseInt(dateStr.substring(0, 2));
        const month = parseInt(dateStr.substring(2, 4)) - 1;
        const day = parseInt(dateStr.substring(4, 6));
        const hour = parseInt(dateStr.substring(6, 8));
        const minute = parseInt(dateStr.substring(8, 10));
        dates.validFrom = new Date(year, month, day, hour, minute).toISOString();
      }
    }
    
    if (cMatch) {
      if (cMatch[1] === 'PERM') {
        dates.validTo = 'PERMANENT';
      } else {
        const dateStr = cMatch[1];
        if (dateStr.length === 10) {
          const year = 2000 + parseInt(dateStr.substring(0, 2));
          const month = parseInt(dateStr.substring(2, 4)) - 1;
          const day = parseInt(dateStr.substring(4, 6));
          const hour = parseInt(dateStr.substring(6, 8));
          const minute = parseInt(dateStr.substring(8, 10));
          dates.validTo = new Date(year, month, day, hour, minute).toISOString();
        }
      }
    }
    
    return dates;
  };

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

            try {
              navData = JSON.parse(rawText);
            } catch (e) {
              console.warn('[API] NAV CANADA response is not JSON; will attempt simple scraping fallback');
            }

            const navItems = [];

            if (navData) {
              // Attempt to normalize common shapes
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

              navItems.forEach((it, index) => {
                // Process CFPS format - parse the JSON strings into clean text
                let bodyText = '';
                let summaryText = '';
                let notamNumber = '';
                let validFrom = '';
                let validTo = '';
                
                // Parse summary and body JSON strings
                if (it.summary && typeof it.summary === 'string') {
                  summaryText = parseCFPSNotamText(it.summary);
                  notamNumber = extractNotamNumber(summaryText);
                  const dates = extractNotamDates(summaryText);
                  validFrom = dates.validFrom;
                  validTo = dates.validTo;
                }
                
                if (it.body && typeof it.body === 'string') {
                  bodyText = parseCFPSNotamText(it.body);
                  // If we didn't get info from summary, try body
                  if (!notamNumber) {
                    notamNumber = extractNotamNumber(bodyText);
                  }
                  if (!validFrom || !validTo) {
                    const dates = extractNotamDates(bodyText);
                    validFrom = validFrom || dates.validFrom;
                    validTo = validTo || dates.validTo;
                  }
                }
                
                // Fallback to original fields if parsing failed
                if (!bodyText) {
                  bodyText = it.notam || it.text || it.raw || it.body || it.description || JSON.stringify(it);
                }
                if (!summaryText) {
                  summaryText = bodyText.split('\n')[0] || bodyText.substring(0, 200) + '...';
                }
                
                // Use provided fields as fallback
                const finalNumber = notamNumber || it.id || it.notamId || it.number || `${upicao}-CFPS-${index + 1}`;
                const finalValidFrom = validFrom || it.start || it.begin || it.validFrom || '';
                const finalValidTo = validTo || it.end || it.finish || it.validTo || '';
                const location = it.site || it.siteCode || it.icao || upicao;

                parsed.push({
                  number: finalNumber,
                  type: it.type || 'NOTAM',
                  classification: it.classification || '',
                  icao: location,
                  location: location,
                  validFrom: finalValidFrom,
                  validTo: finalValidTo,
                  summary: summaryText,
                  body: bodyText,
                  qLine: it.qLine || bodyText.split('\n')[0] || ''
                });
              });
            } else {
              // navData was not JSON — use raw text fallback
              const chunks = rawText.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
              if (chunks.length > 0) {
                chunks.forEach((chunk, idx) => {
                  parsed.push({
                    number: `${upicao}-NAVCAN-${idx+1}`,
                    type: 'NOTAM',
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
      if (!n.validTo || n.validTo === 'PERMANENT') return true;
      try {
        return new Date(n.validTo) >= now;
      } catch {
        return true;
      }
    });

    // Dispatcher-priority sort
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
