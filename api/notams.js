// api/notams.js - Vercel serverless function for NOTAM fetching

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
    const url = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao.toUpperCase()}&responseFormat=geoJson&pageSize=1000`;
    
    console.log(`[API] Fetching NOTAMs for ${icao} from: ${url}`);

    const response = await fetch(url, {
      headers: {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (!response.ok) {
      console.error(`[API] FAA API returned ${response.status}: ${response.statusText}`);
      
      if (response.status === 429) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
      
      return res.status(response.status).json({ 
        error: `FAA API error: ${response.status} ${response.statusText}` 
      });
    }

    const data = await response.json();
    console.log(`[API] Received ${data.items?.length || 0} items from FAA API`);

    // Parse and flatten NOTAMs for easy display
    const items = data.items || [];
    let parsed = items.map(item => {
      const core = item.properties?.coreNOTAMData?.notam || {};
      const translation = (item.properties?.coreNOTAMData?.notamTranslation || [])[0] || {};
      const icaoLocation = core.icaoLocation || core.location || icao;
      
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

    console.log(`[API] Sending ${parsed.length} processed NOTAMs for ${icao}`);
    
    // Set cache headers
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600'); // 5 min cache, 10 min stale
    
    return res.status(200).json(parsed);

  } catch (error) {
    console.error(`[API] Error fetching NOTAMs for ${icao}:`, error);
    
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return res.status(504).json({ error: 'Request timeout' });
    }
    
    return res.status(500).json({ 
      error: 'Failed to fetch NOTAMs', 
      details: error.message 
    });
  }
}
