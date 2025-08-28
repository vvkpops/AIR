// api/notams.js - Vercel serverless function for NOTAM fetching
// Updated: improved fallback to NAV CANADA CFPS with proper NOTAM text parsing

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

  // Function to parse Canadian CFPS NOTAM text
  const parseCFPSNotams = (rawText) => {
    const notams = [];
    
    if (!rawText || typeof rawText !== 'string') {
      return notams;
    }

    // Split the text by NOTAM identifiers (like H4387/25, H4359/25, etc.)
    const notamBlocks = [];
    const lines = rawText.split('\n');
    let currentBlock = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if this line starts a new NOTAM (contains NOTAM identifier pattern)
      if (line.match(/^\(?[A-Z]\d+\/\d+\s+NOTAM/)) {
        // Save previous block if it exists
        if (currentBlock.length > 0) {
          notamBlocks.push(currentBlock.join('\n'));
        }
        // Start new block
        currentBlock = [line];
      } else if (currentBlock.length > 0) {
        // Add line to current block
        currentBlock.push(line);
        
        // Check if this is the end of E) section
        if (line.match(/^E\)/)) {
          // Look ahead to see if next line is empty or starts a new NOTAM
          if (i + 1 >= lines.length || lines[i + 1].trim() === '' || lines[i + 1].match(/^\(?[A-Z]\d+\/\d+\s+NOTAM/)) {
            // End current block here
            notamBlocks.push(currentBlock.join('\n'));
            currentBlock = [];
          }
        }
      }
    }
    
    // Don't forget the last block
    if (currentBlock.length > 0) {
      notamBlocks.push(currentBlock.join('\n'));
    }

    // Parse each NOTAM block
    notamBlocks.forEach((block, index) => {
      if (!block.trim()) return;
      
      const lines = block.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length === 0) return;

      // Extract NOTAM ID from first line
      const firstLine = lines[0];
      const idMatch = firstLine.match(/^\(?([A-Z]\d+\/\d+)/);
      const notamId = idMatch ? idMatch[1] : `CFPS-${index + 1}`;

      // Parse standard NOTAM sections
      const notamObj = {
        number: notamId,
        type: 'NOTAM',
        classification: '',
        icao: icao.toUpperCase(),
        location: icao.toUpperCase(),
        validFrom: '',
        validTo: '',
        summary: '',
        body: block,
        qLine: '',
        aLine: '',
        bLine: '',
        cLine: '',
        dLine: '',
        eLine: '',
        rawText: block,
        source: 'NAV CANADA CFPS',
        isPermanent: false
      };

      // Parse each line for standard NOTAM sections
      lines.forEach(line => {
        const upperLine = line.toUpperCase();
        
        if (upperLine.startsWith('Q)')) {
          notamObj.qLine = line;
        } else if (upperLine.startsWith('A)')) {
          notamObj.aLine = line.substring(2).trim();
          notamObj.location = notamObj.aLine || icao.toUpperCase();
        } else if (upperLine.startsWith('B)')) {
          notamObj.bLine = line.substring(2).trim();
          // Try to parse the date/time
          const dateMatch = notamObj.bLine.match(/(\d{10})/);
          if (dateMatch) {
            const dt = dateMatch[1];
            const year = 2000 + parseInt(dt.substring(0, 2));
            const month = parseInt(dt.substring(2, 4)) - 1;
            const day = parseInt(dt.substring(4, 6));
            const hour = parseInt(dt.substring(6, 8));
            const minute = parseInt(dt.substring(8, 10));
            notamObj.validFrom = new Date(year, month, day, hour, minute).toISOString();
          }
        } else if (upperLine.startsWith('C)')) {
          notamObj.cLine = line.substring(2).trim();
          notamObj.isPermanent = notamObj.cLine.includes('PERM');
          if (!notamObj.isPermanent) {
            const dateMatch = notamObj.cLine.match(/(\d{10})/);
            if (dateMatch) {
              const dt = dateMatch[1];
              const year = 2000 + parseInt(dt.substring(0, 2));
              const month = parseInt(dt.substring(2, 4)) - 1;
              const day = parseInt(dt.substring(4, 6));
              const hour = parseInt(dt.substring(6, 8));
              const minute = parseInt(dt.substring(8, 10));
              notamObj.validTo = new Date(year, month, day, hour, minute).toISOString();
            }
          }
        } else if (upperLine.startsWith('D)')) {
          notamObj.dLine = line.substring(2).trim();
        } else if (upperLine.startsWith('E)')) {
          notamObj.eLine = line.substring(2).trim();
          notamObj.summary = notamObj.eLine;
        }
      });

      // Use E) section as summary if available, otherwise use first meaningful line
      if (!notamObj.summary && lines.length > 1) {
        notamObj.summary = lines.find(l => !l.match(/^[A-Z]\)/)) || lines[1];
      }

      notams.push(notamObj);
    });

    return notams;
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
            const rawText = await navResp.text();
            let navData = null;

            try {
              navData = JSON.parse(rawText);
            } catch (e) {
              console.warn('[API] NAV CANADA response is not JSON');
              return res.status(500).json({ error: 'Failed to parse NAV CANADA response' });
            }

            if (navData && navData.raw && typeof navData.raw === 'string') {
              console.log(`[API] Parsing CFPS NOTAMs from raw text for ${upicao}`);
              parsed = parseCFPSNotams(navData.raw);
            } else {
              console.warn(`[API] NAV CANADA response missing 'raw' field or not a string`);
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
