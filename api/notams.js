// api/notams.js - Vercel serverless function for NOTAM fetching (FAA primary, NAV CANADA CFPS fallback)
// - Preserves FAA flow unchanged
// - Robust NAV CANADA CFPS parsing: handles JSON-in-strings, double-escaped JSON, HTML wrappers, plain text
// - De-escapes "\n" to real newlines and returns cleaned "body"/"rawText" fields
// - Normalizes and optionally enriches items via an internal cleanNotams() implementation
//
// Notes:
// - This file is self-contained (no external notam parser import) so you can drop it in as a single update.
// - The output shape preserves the front-end expected fields (number, type, classification, icao, location, validFrom, validTo, summary, body, rawText, qLine)
// - Additionally each returned item includes a `parsed` field containing canonical extracted fields (english, french, start/end ISO, q object, firs, activeNow).
//
// Usage: GET /api/notams?icao=CYYY

export default async function handler(req, res) {
  // CORS
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
  if (!icao || typeof icao !== 'string' || icao.length !== 4) {
    return res.status(400).json({ error: 'Invalid ICAO code' });
  }

  const CLIENT_ID = process.env.REACT_APP_FAA_CLIENT_ID;
  const CLIENT_SECRET = process.env.REACT_APP_FAA_API_KEY;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing FAA API credentials');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // --- Utility helpers (JSON parsing, unescape, extraction) ---
  const tryParseJSON = (text) => {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  };

  // Unescape repeated sequences until stable: handles double-escaped "\n", "\\n", escaped quotes, etc.
  const unescapeString = (s) => {
    if (s === null || s === undefined) return '';
    let str = String(s);
    // Normalize CRLF to LF
    str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let prev;
    do {
      prev = str;
      // reduce double-escaped newline sequences and other common escapes
      str = str
        .replace(/\\\\n/g, '\\n')  // reduce double-escaping
        .replace(/\\n/g, '\n')     // actual newline
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');   // reduce backslashes
    } while (str !== prev);
    return str;
  };

  // Attempts to extract a JSON-like blob from text (useful when JSON is embedded in HTML or strings)
  const extractJSONBlob = (text) => {
    if (!text || typeof text !== 'string') return null;
    // direct parse
    const direct = tryParseJSON(text);
    if (direct) return direct;

    // look for candidate keys and then try to find an object/array substring
    const keyCandidates = ['"Alpha"', '"alpha"', '"notam"', '"notams"', '"raw"', '"english"'];
    for (const key of keyCandidates) {
      const idx = text.indexOf(key);
      if (idx === -1) continue;
      const before = text.slice(0, idx);
      const openBrace = Math.max(before.lastIndexOf('{'), before.lastIndexOf('['));
      if (openBrace === -1) continue;
      // find close brace after idx (simple heuristic)
      const closeBrace = (() => {
        const idxObj = text.indexOf('}', idx);
        const idxArr = text.indexOf(']', idx);
        if (idxObj === -1 && idxArr === -1) return -1;
        if (idxObj === -1) return idxArr;
        if (idxArr === -1) return idxObj;
        return Math.max(idxObj, idxArr);
      })();
      if (closeBrace === -1) continue;
      const candidate = text.slice(openBrace, closeBrace + 1);
      const parsed = tryParseJSON(candidate);
      if (parsed) return parsed;
    }

    // double-encoded JSON inside quotes -> unescape then parse
    const doubleQuotedJsonMatch = text.match(/"(\{(?:[^"\\]|\\.)*\})"/s);
    if (doubleQuotedJsonMatch) {
      const unescaped = doubleQuotedJsonMatch[1].replace(/\\"/g, '"');
      const parsed = tryParseJSON(unescaped);
      if (parsed) return parsed;
    }

    return null;
  };

  // --- Canonical parser ported from user's TypeScript notamParser ---
  // tryParseInner: tries to JSON.parse a field which may itself be a JSON-string; if fail, returns object with .raw de-escaped
  const tryParseInner = (s) => {
    if (!s) return {};
    // If input is already object, return with de-escaped strings
    if (typeof s === 'object') {
      const out = {};
      Object.entries(s).forEach(([k, v]) => {
        out[k] = typeof v === 'string' ? unescapeString(v) : v;
      });
      return out;
    }
    try {
      const inner = JSON.parse(s);
      const out = {};
      Object.entries(inner).forEach(([k, v]) => {
        out[k] = typeof v === 'string' ? unescapeString(v) : v;
      });
      return out;
    } catch {
      return { raw: unescapeString(s) };
    }
  };

  const pickLang = (inner) =>
    (inner && inner.english && String(inner.english).trim()) ||
    (inner && inner.raw && String(inner.raw).trim()) ||
    '';

  const extractSection = (text, label) => {
    if (!text) return '';
    const re = new RegExp(`${label}\\)\\s*([\\s\\S]*?)(?:\\n[A-Z]\\)|$)`, 'm');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };

  const parseA_FIRs = (text) => {
    if (!text) return undefined;
    const m = text.match(/A\)\s+([A-Z0-9 \-]+)/);
    if (!m) return undefined;
    return m[1].trim().split(/\s+/).filter(Boolean);
  };

  const parseBC = (text) => {
    if (!text) return {};
    const b = text.match(/B\)\s*(\d{10})/); // YYMMDDHHMM
    const c = text.match(/C\)\s*(PERM|(\d{10})([A-Z]{3})?)/);

    const fmt = (yymmddhhmm) => {
      const yy = +yymmddhhmm.slice(0, 2);
      const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
      const MM = +yymmddhhmm.slice(2, 4);
      const dd = +yymmddhhmm.slice(4, 6);
      const hh = +yymmddhhmm.slice(6, 8);
      const mm = +yymmddhhmm.slice(8, 10);
      const d = new Date(Date.UTC(yyyy, MM - 1, dd, hh, mm));
      return d.toISOString();
    };

    let start;
    let end;
    let est = false;

    if (b) start = fmt(b[1]);
    if (c) {
      if (c[1] === 'PERM') {
        end = 'PERM';
      } else if (c[2]) {
        end = fmt(c[2]);
        est = c[3] === 'EST';
      }
    }
    return { start, end, est };
  };

  const parsePosRadius = (s) => {
    if (!s) return { center: null, radiusNm: null };
    // pattern: DDMMNDDDMMWrrr
    const m = s.match(/^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])(\d{3})$/);
    if (!m) return { center: null, radiusNm: null };

    const latDeg = +m[1], latMin = +m[2], latHem = m[3];
    const lonDeg = +m[4], lonMin = +m[5], lonHem = m[6];
    const radiusNm = +m[7];

    const lat = (latDeg + latMin / 60) * (latHem === 'S' ? -1 : 1);
    const lon = (lonDeg + lonMin / 60) * (lonHem === 'W' ? -1 : 1);

    return { center: { lat, lon }, radiusNm };
  };

  const parseQ = (line) => {
    if (!line) return null;
    const q = String(line).trim();
    if (!/^Q\)/.test(q)) return null;
    const content = q.slice(2).trim();
    const parts = content.split('/').map(p => p.trim());

    const fir = parts[0] || undefined;
    const code = parts[1] || undefined;
    const traffic = parts[2] || undefined;
    const purpose = parts[3] || undefined;
    const scope = parts[4] || undefined;
    const lower = parts[5] || undefined;
    const upper = parts[6] || undefined;
    const posrad = parts[7] || undefined;

    const parsedPos = parsePosRadius(posrad);

    return { fir, code, traffic, purpose, scope, lower, upper, ...parsedPos };
  };

  const findQLineIn = (text) => {
    if (!text) return undefined;
    const m = text.match(/^(Q\)\s*[^\n\r]+)/m);
    return m ? m[1] : undefined;
  };

  const computeActive = (start, end) => {
    if (!start) return true;
    const now = Date.now();
    const s = new Date(start).getTime();
    if (end && end !== 'PERM' && end !== 'EST') {
      const e = new Date(end).getTime();
      return now >= s && now <= e;
    }
    return now >= s;
  };

  // cleanNotams: canonicalizes an array of InputNotam objects into CleanNotam-like objects
  const cleanNotams = (input) => {
    if (!Array.isArray(input)) return [];
    return input.map((n) => {
      const innerSummary = tryParseInner(n.summary);
      const innerBody = tryParseInner(n.body);

      const combined = pickLang(innerSummary) || pickLang(innerBody);
      const raw = combined || innerSummary.raw || innerBody.raw || '';

      const qLineProvided = n.qLine && String(n.qLine).trim() ? n.qLine : undefined;
      const qLineFound = qLineProvided || findQLineIn(raw);

      const firs = parseA_FIRs(raw);
      const { start, end, est } = parseBC(raw);
      const qParsed = qLineFound ? parseQ(qLineFound) : null;

      const english =
        (innerSummary && innerSummary.english && String(innerSummary.english).trim()) ||
        (innerBody && innerBody.english && String(innerBody.english).trim()) ||
        extractSection(raw, 'E');

      // detect FR: block
      let frBlock = null;
      if (raw && raw.includes('\nFR:\n')) {
        frBlock = raw.split('\nFR:\n').slice(1).join('\nFR:\n').trim();
      } else {
        const tmp = extractSection(raw, 'F');
        if (tmp) frBlock = tmp;
      }

      const french =
        (innerSummary && innerSummary.french && String(innerSummary.french).trim()) ||
        (innerBody && innerBody.french && String(innerBody.french).trim()) ||
        (frBlock || null);

      return {
        id: n.number || '',
        icao: n.icao || n.location || '',
        type: n.type || '',
        firs: firs || [],
        q: qParsed
          ? {
              fir: qParsed.fir,
              code: qParsed.code,
              traffic: qParsed.traffic,
              purpose: qParsed.purpose,
              scope: qParsed.scope,
              lower: qParsed.lower,
              upper: qParsed.upper,
              center: qParsed.center,
              radiusNm: qParsed.radiusNm,
            }
          : null,
        start: start || undefined,
        end: end || undefined,
        est: !!est,
        english: english ? String(english).trim() : '',
        french: french || null,
        raw: raw,
        activeNow: computeActive(start, end),
      };
    });
  };

  // --- End utilities / canonical parser ---

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
      // For non-Canadian ICAOs, return FAA error
      if (!(upicao[0] === 'C')) {
        return res.status(faaResp.status).json({ error: `FAA API error: ${faaResp.status} ${faaResp.statusText}` });
      }
      // Otherwise, allow fallback for Canadian ICAOs
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

    // Build `parsed` array as the generic output items (pre-clean)
    let parsed = [];

    if (faaItems.length > 0) {
      console.log(`[API] Received ${faaItems.length} items from FAA API`);
      parsed = faaItems.map(item => {
        const core = item.properties?.coreNOTAMData?.notam || {};
        const translation = (item.properties?.coreNOTAMData?.notamTranslation || [])[0] || {};
        const icaoLocation = core.icaoLocation || core.location || upicao;

        const summary = translation.simpleText || translation.formattedText || core.text || '';
        const body = core.text || translation.formattedText || '';

        return {
          number: core.number || '',
          type: core.type || '',
          classification: core.classification || '',
          icao: icaoLocation,
          location: core.location || icaoLocation,
          validFrom: core.effectiveStart || core.issued || '',
          validTo: core.effectiveEnd || '',
          summary: typeof summary === 'string' ? unescapeString(summary) : summary,
          body: typeof body === 'string' ? unescapeString(body) : body,
          rawText: typeof body === 'string' ? unescapeString(body) : '',
          qLine: core.qLine || (translation.formattedText?.split('\n')[0]) || '',
        };
      });
    } else {
      // FAA returned no items or parsed to empty - try NAV CANADA CFPS for Canadian ICAOs
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

            // Try parse JSON directly or extract a JSON blob
            let navData = tryParseJSON(rawText) || extractJSONBlob(rawText);

            const navItems = [];

            const pushNavItem = (it) => {
              if (!it) return;
              navItems.push(it);
            };

            if (navData) {
              // Normalize possible wrappers
              if (Array.isArray(navData)) {
                navData.forEach(it => pushNavItem(it));
              } else {
                const wrapperKeys = ['Alpha', 'alpha', 'notam', 'notams', 'NOTAM', 'NOTAMS', 'data', 'results', 'items', 'features'];
                let found = false;
                for (const k of wrapperKeys) {
                  if (navData[k]) {
                    const inner = navData[k];
                    if (Array.isArray(inner)) inner.forEach(it => pushNavItem(it));
                    else if (typeof inner === 'object') pushNavItem(inner);
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
                    if (arrays.length > 0) arrays[0].forEach(it => pushNavItem(it));
                    else pushNavItem(navData);
                  }
                }
              }

              // Map navItems into generic parsed entries
              navItems.forEach(it => {
                // Candidate fields - prefer body/summary/raw/english
                const candidateField = it.body || it.summary || it.raw || it.english || it.text || it.description || it.rawText || it.notam || it.notice || '';
                // Extract readable full text
                const extractTextFromValue = (val) => {
                  if (val === null || val === undefined) return '';
                  if (typeof val === 'object') {
                    if (typeof val.english === 'string' && val.english.trim()) return unescapeString(val.english);
                    if (typeof val.raw === 'string' && val.raw.trim()) return unescapeString(val.raw);
                    if (typeof val.body === 'string' && val.body.trim()) return unescapeString(val.body);
                    if (typeof val.text === 'string' && val.text.trim()) return unescapeString(val.text);
                    try { return unescapeString(JSON.stringify(val)); } catch (e) { return String(val); }
                  }
                  if (typeof val === 'string') {
                    let s = val.trim();
                    // If looks like JSON, parse and recurse
                    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                      const p = tryParseJSON(s);
                      if (p) return extractTextFromValue(p);
                    }
                    if (s.startsWith('"') && s.endsWith('"')) {
                      s = s.slice(1, -1).replace(/\\"/g, '"');
                      const p2 = tryParseJSON(s);
                      if (p2) return extractTextFromValue(p2);
                    }
                    const jsonSub = s.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
                    if (jsonSub) {
                      const p3 = tryParseJSON(jsonSub[1]);
                      if (p3) return extractTextFromValue(p3);
                    }
                    const rawMatch = s.match(/"raw"\s*:\s*"([\s\S]*?)"/);
                    if (rawMatch) return unescapeString(rawMatch[1]);
                    const engMatch = s.match(/"english"\s*:\s*"([\s\S]*?)"/);
                    if (engMatch) return unescapeString(engMatch[1]);
                    return unescapeString(s);
                  }
                  return String(val);
                };

                const fullText = extractTextFromValue(candidateField) || '';
                // Find qLine if present
                let qLine = '';
                if (it.qLine) qLine = it.qLine;
                else if (it.q) qLine = it.q;
                else {
                  const qMatch = fullText.match(/(^|\n)\s*(Q\)[^\n]*)/i);
                  if (qMatch) qLine = qMatch[2].trim();
                }

                const number = String(it.id || it.notamId || it.number || it.noticeNumber || it.noticeid || it.header || '') || '';
                const validFrom = it.start || it.begin || it.validFrom || it.from || it.b || it.B || '';
                const validTo = it.end || it.finish || it.validTo || it.to || it.c || it.C || '';
                const location = it.site || it.siteCode || it.location || it.aerodrome || upicao;

                const bodyText = fullText;
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
              // navData not JSON - treat rawText as plain text/HTML
              let cleaned = rawText || '';
              const preMatch = cleaned.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
              if (preMatch && preMatch[1]) {
                cleaned = preMatch[1];
              } else {
                cleaned = cleaned.replace(/<\/?[^>]+(>|$)/g, '\n');
              }
              cleaned = unescapeString(cleaned);

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

    // At this point `parsed` is an array of generic items with summary/body/rawText possibly as de-escaped text.
    // Now normalize canonical fields using cleanNotams(), then map back into the front-end shape keeping compatibility.

    try {
      const inputForClean = parsed.map(p => ({
        number: p.number || '',
        type: p.type || '',
        classification: p.classification || '',
        icao: p.icao || p.location || upicao,
        location: p.location || p.icao || upicao,
        validFrom: p.validFrom || '',
        validTo: p.validTo || '',
        summary: typeof p.summary === 'string' ? p.summary : '',
        body: typeof p.body === 'string' ? p.body : '',
        qLine: p.qLine || ''
      }));

      const cleaned = cleanNotams(inputForClean);

      // Map cleaned items back to parsed with enriched canonical fields
      parsed = cleaned.map((c, idx) => {
        const original = inputForClean[idx] || {};
        // prefer english text then raw then original fields
        const primaryText = c.english && String(c.english).trim() ? c.english : (c.raw || original.body || original.summary || '');
        const primarySummary = String(primaryText).split('\n')[0] || original.summary || '';

        // Build a qLine string if we have parts
        let qLine = original.qLine || '';
        if (!qLine && c.q && c.q.code) {
          // Build minimal Q) string: Q) FIR/CODE/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/POSRAD
          const posrad = (c.q.center && c.q.radiusNm) ? (() => {
            // compose lat/lon back into DDMMNDDDMMWrrr form roughly (rounded)
            try {
              const lat = Math.abs(c.q.center.lat);
              const lon = Math.abs(c.q.center.lon);
              const latDeg = Math.floor(lat);
              const latMin = Math.round((lat - latDeg) * 60);
              const lonDeg = Math.floor(lon);
              const lonMin = Math.round((lon - lonDeg) * 60);
              const latHem = c.q.center.lat < 0 ? 'S' : 'N';
              const lonHem = c.q.center.lon < 0 ? 'W' : 'E';
              const rad = String(c.q.radiusNm || '').padStart(3, '0');
              return `${String(latDeg).padStart(2,'0')}${String(latMin).padStart(2,'0')}${latHem}${String(lonDeg).padStart(3,'0')}${String(lonMin).padStart(2,'0')}${lonHem}${rad}`;
            } catch {
              return '';
            }
          })() : '';
          const parts = [
            c.q.fir || '',
            c.q.code || '',
            c.q.traffic || '',
            c.q.purpose || '',
            c.q.scope || '',
            c.q.lower || '',
            c.q.upper || '',
            posrad || ''
          ].join('/').replace(/\/+$/,'');
          qLine = parts ? `Q) ${parts}` : '';
        }

        return {
          number: c.id || original.number || `${upicao}-NOTAM-${idx+1}`,
          type: original.type || c.type || 'notam',
          classification: original.classification || '',
          icao: c.icao || original.icao || upicao,
          location: c.icao || original.location || upicao,
          validFrom: c.start || original.validFrom || '',
          validTo: c.end || original.validTo || '',
          summary: primarySummary,
          body: primaryText,
          rawText: c.raw || primaryText,
          qLine: qLine || original.qLine || '',
          parsed: c
        };
      });
    } catch (e) {
      console.warn('[API] cleanNotams failed, returning raw parsed items', e);
      // leave parsed as-is
    }

    // Filter for currently valid or future NOTAMs only
    const now = new Date();
    parsed = parsed.filter(n => {
      if (!n.validTo) return true; // keep if end time missing
      try {
        // Accept "PERM" as valid
        if (typeof n.validTo === 'string' && n.validTo.toUpperCase() === 'PERM') return true;
        return new Date(n.validTo) >= now;
      } catch {
        return true;
      }
    });

    // Sort with dispatcher-priority (closures, RSC, CRFI) then recent validFrom first
    parsed.sort((a, b) => {
      const isClosureA = /clsd|closed/i.test(a.summary || '') || /CLOSE|CLOSED/i.test(a.body || '');
      const isRscA = /rsc/i.test(a.summary || '') || /RSC/i.test(a.body || '');
      const isCrfiA = /crfi/i.test(a.summary || '') || /CRFI/i.test(a.body || '');

      const isClosureB = /clsd|closed/i.test(b.summary || '') || /CLOSE|CLOSED/i.test(b.body || '');
      const isRscB = /rsc/i.test(b.summary || '') || /RSC/i.test(b.body || '');
      const isCrfiB = /crfi/i.test(b.summary || '') || /CRFI/i.test(b.body || '');

      if (isClosureA && !isClosureB) return -1;
      if (!isClosureA && isClosureB) return 1;

      if (isRscA && !isRscB) return -1;
      if (!isRscA && isRscB) return 1;

      if (isCrfiA && !isCrfiB) return -1;
      if (!isCrfiA && isCrfiB) return 1;

      try {
        const da = new Date(a.validFrom || 0).getTime();
        const db = new Date(b.validFrom || 0).getTime();
        return db - da;
      } catch {
        return 0;
      }
    });

    // Limit to 50 NOTAMs
    parsed = parsed.slice(0, 50);

    console.log(`[API] Sending ${parsed.length} processed NOTAMs for ${upicao}`);

    // Cache headers
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    return res.status(200).json(parsed);

  } catch (error) {
    console.error(`[API] Error fetching NOTAMs for ${req.query.icao}:`, error);
    if (error && (error.name === 'AbortError' || (typeof error.message === 'string' && error.message.includes('timeout')))) {
      return res.status(504).json({ error: 'Request timeout' });
    }
    return res.status(500).json({
      error: 'Failed to fetch NOTAMs',
      details: error?.message || String(error)
    });
  }
}
