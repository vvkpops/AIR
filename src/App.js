import React, { useState, useEffect, useRef } from 'react';
import './index.css';

// Weather utilities
const TAF_CACHE_MS = 600000; // 10 minutes
const METAR_CACHE_MS = 60000; // 1 minute

const weatherCache = {};
const corsProxy = "https://corsproxy.io/?";

async function fetchTAF(icao) {
  if (!icao) return "";
  
  const cached = weatherCache[icao]?.taf;
  if (cached && (Date.now() - cached.time < TAF_CACHE_MS)) return cached.data;
  
  try {
    const res = await fetch(`${corsProxy}https://aviationweather.gov/cgi-bin/data/taf.php?ids=${icao}&format=raw`);
    const text = (await res.text()).trim();
    weatherCache[icao] = weatherCache[icao] || {};
    weatherCache[icao].taf = { data: text, time: Date.now() };
    return text;
  } catch (error) {
    console.error(`Error fetching TAF for ${icao}:`, error);
    return "";
  }
}

async function fetchMETAR(icao) {
  if (!icao) return "";
  
  const cached = weatherCache[icao]?.metar;
  if (cached && (Date.now() - cached.time < METAR_CACHE_MS)) return cached.data;
  
  try {
    const res = await fetch(`${corsProxy}https://aviationweather.gov/cgi-bin/data/metar.php?ids=${icao}&format=raw`);
    const text = (await res.text()).trim();
    weatherCache[icao] = weatherCache[icao] || {};
    weatherCache[icao].metar = { data: text, time: Date.now() };
    return text;
  } catch (error) {
    console.error(`Error fetching METAR for ${icao}:`, error);
    return "";
  }
}

function parseLine(line) {
  let ceiling = Infinity;
  let visMiles = Infinity;
  let isGreater = false;
  let isLess = false;

  if (!line || typeof line !== 'string') {
    return { ceiling, visMiles, isGreater, isLess };
  }

  const l = line.replace(/\u00A0/g, ' ').toUpperCase();

  const cloud = l.match(/(BKN|OVC|VV)\s*(\d{3})/);
  if (cloud) {
    ceiling = parseInt(cloud[2], 10) * 100;
  }

  const visRegex = /\b([PM])?\s*((\d{1,2})\s+(\d{1,2}\/\d{1,2})|(\d{1,2}\/\d{1,2})|(\d{1,2}))\s*SM\b/i;
  const m = l.match(visRegex);

  function parseFractionString(fracStr) {
    const pieces = fracStr.split('/');
    const num = parseFloat(pieces[0]);
    const den = parseFloat(pieces[1]) || 1;
    if (!isFinite(num) || !isFinite(den) || den === 0) return 0;
    return num / den;
  }

  if (m) {
    const prefix = (m[1] || '').toUpperCase();
    if (prefix === 'P') isGreater = true;
    if (prefix === 'M') isLess = true;

    if (m[3] && m[4]) {
      const whole = parseInt(m[3], 10);
      const frac = parseFractionString(m[4]);
      visMiles = whole + frac;
    } else if (m[5]) {
      visMiles = parseFractionString(m[5]);
    } else if (m[6]) {
      visMiles = parseInt(m[6], 10);
    }
  }

  if (!isFinite(visMiles)) visMiles = Infinity;

  return { ceiling, visMiles, isGreater, isLess };
}

function highlightTAFAllBelow(raw, minC, minV) {
  return raw.split("\n").map(line => {
    const p = parseLine(line);
    const visOk = p.isGreater ? true : (p.visMiles >= minV);
    const ceilOk = p.ceiling >= minC;
    return `<div class="${!(visOk && ceilOk) ? "text-red-400 font-bold" : ""}">${line}</div>`;
  }).join("");
}

// NOTAM parsing utilities
const parseNotamText = (notamText) => {
  if (!notamText) return null;
  
  const lines = notamText.split('\n').map(line => line.trim()).filter(line => line);
  if (lines.length === 0) return null;
  
  // Extract NOTAM components
  const notamObj = {
    id: '',
    qLine: '',
    aLine: '',
    bLine: '',
    cLine: '',
    dLine: '',
    eLine: '',
    fLine: '',
    gLine: '',
    rawText: notamText,
    classification: '',
    traffic: '',
    purpose: '',
    scope: '',
    lowerLimit: '',
    upperLimit: '',
    coordinates: '',
    validFrom: '',
    validTo: '',
    schedule: '',
    description: '',
    isTemporary: false,
    isPermanent: false
  };
  
  // Parse each line
  lines.forEach(line => {
    const upperLine = line.toUpperCase();
    
    // Extract NOTAM ID from first line
    if (!notamObj.id && line.match(/^\w+\s+NOTAM/i)) {
      const idMatch = line.match(/^(\w+)/);
      if (idMatch) notamObj.id = idMatch[1];
    }
    
    // Q Line - Qualifier Line (most important)
    if (upperLine.startsWith('Q)')) {
      notamObj.qLine = line;
      
      // Parse Q line components: Q)ICAO/QCODE/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/COORDINATES/RADIUS
      const qParts = line.substring(2).split('/');
      if (qParts.length >= 8) {
        notamObj.classification = qParts[1] || '';
        notamObj.traffic = qParts[2] || '';
        notamObj.purpose = qParts[3] || '';
        notamObj.scope = qParts[4] || '';
        notamObj.lowerLimit = qParts[5] || '';
        notamObj.upperLimit = qParts[6] || '';
        notamObj.coordinates = qParts[7] || '';
      }
    }
    
    // A Line - Location
    else if (upperLine.startsWith('A)')) {
      notamObj.aLine = line.substring(2).trim();
    }
    
    // B Line - Valid From
    else if (upperLine.startsWith('B)')) {
      notamObj.bLine = line.substring(2).trim();
      notamObj.validFrom = parseNotamDateTime(notamObj.bLine);
    }
    
    // C Line - Valid To
    else if (upperLine.startsWith('C)')) {
      notamObj.cLine = line.substring(2).trim();
      notamObj.validTo = parseNotamDateTime(notamObj.cLine);
      notamObj.isPermanent = notamObj.cLine.includes('PERM');
    }
    
    // D Line - Schedule
    else if (upperLine.startsWith('D)')) {
      notamObj.dLine = line.substring(2).trim();
      notamObj.schedule = notamObj.dLine;
    }
    
    // E Line - Description (most important for users)
    else if (upperLine.startsWith('E)')) {
      notamObj.eLine = line.substring(2).trim();
      notamObj.description = notamObj.eLine;
    }
    
    // F Line - Lower Limit
    else if (upperLine.startsWith('F)')) {
      notamObj.fLine = line.substring(2).trim();
    }
    
    // G Line - Upper Limit
    else if (upperLine.startsWith('G)')) {
      notamObj.gLine = line.substring(2).trim();
    }
  });
  
  // Determine if temporary
  notamObj.isTemporary = !notamObj.isPermanent && (notamObj.validTo || notamObj.schedule);
  
  return notamObj;
};

const parseNotamDateTime = (dateTimeStr) => {
  if (!dateTimeStr || dateTimeStr.includes('PERM')) return null;
  
  // NOTAM date format is typically YYMMDDHHMM
  const match = dateTimeStr.match(/(\d{10})/);
  if (match) {
    const dt = match[1];
    const year = 2000 + parseInt(dt.substring(0, 2));
    const month = parseInt(dt.substring(2, 4)) - 1; // JS months are 0-indexed
    const day = parseInt(dt.substring(4, 6));
    const hour = parseInt(dt.substring(6, 8));
    const minute = parseInt(dt.substring(8, 10));
    
    return new Date(year, month, day, hour, minute);
  }
  
  return null;
};

const getNotamTypeDescription = (qCode) => {
  if (!qCode) return 'General';
  
  const typeMap = {
    'QXXXX': 'General',
    'QRXXX': 'Runway',
    'QTXXX': 'Taxiway',
    'QAXXX': 'Apron',
    'QLXXX': 'Lighting',
    'QNXXX': 'Navigation',
    'QFXXX': 'Facilities',
    'QOXXX': 'Obstacles',
    'QPXXX': 'Personnel',
    'QSXXX': 'Services',
    'QWXXX': 'Warning',
    'QMXXX': 'Misc',
    'QCXXX': 'Communications',
    'QIXXX': 'Instrument Procedures',
    'QRWXX': 'Runway Closure',
    'QRWCH': 'Runway Closed',
    'QTACH': 'Taxiway Closed',
    'QOBST': 'Obstacle',
    'QNACS': 'Navigation Aid Closed',
    'QFALC': 'Approach Light Closed',
    'QFAPZ': 'Airport Closed'
  };
  
  // Check for exact matches first
  if (typeMap[qCode]) return typeMap[qCode];
  
  // Check for partial matches
  for (const [code, desc] of Object.entries(typeMap)) {
    if (qCode.startsWith(code.substring(0, 2))) {
      return desc;
    }
  }
  
  return 'General';
};

// Header Component
const Header = () => {
  const [localTime, setLocalTime] = useState('');
  const [utcTime, setUtcTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setLocalTime(now.toLocaleTimeString() + ' Local');
      setUtcTime(now.toUTCString().slice(17, 25) + ' UTC');
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="p-4 mb-6 max-w-screen-2xl mx-auto">
      <div className="text-center">
        <div className="text-2xl sm:text-3xl font-bold text-cyan-300">
          Weather Monitor Dashboard
        </div>
        <div className="mt-2 w-full flex flex-col sm:flex-row items-center text-base sm:text-lg font-mono text-gray-200 font-semibold">
          <span className="w-full sm:w-1/2 text-center sm:text-left">
            <span className="inline-block text-lg sm:text-xl font-bold">{localTime}</span>
          </span>
          <span className="w-full sm:w-1/2 text-center sm:text-right">
            <span className="inline-block text-lg sm:text-xl font-bold text-cyan-400">{utcTime}</span>
          </span>
        </div>
      </div>
    </header>
  );
};

// Fixed NOTAM Modal Component
const NotamModal = ({ icao, isOpen, onClose, notamData, loading, error }) => {
  const modalRef = useRef(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Prevent scrolling when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 px-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div 
        ref={modalRef}
        className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden border border-gray-600"
        style={{ position: 'relative', transform: 'none' }}
      >
        {/* Header - Fixed */}
        <div className="flex justify-between items-center border-b border-gray-700 p-4 bg-gray-900" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">📋</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-cyan-400">NOTAMs for {icao}</h3>
              <p className="text-gray-400 text-sm">Notice to Airmen - Current Active NOTAMs</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-3xl focus:outline-none hover:bg-gray-700 rounded-full w-10 h-10 flex items-center justify-center transition-colors"
            title="Close NOTAMs"
          >
            ×
          </button>
        </div>
        
        {/* Content - Scrollable */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(95vh - 8rem)' }}>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-10 h-10 border-4 border-t-orange-500 border-gray-600 rounded-full animate-spin"></div>
              <p className="mt-4 text-orange-400 font-semibold">Fetching NOTAMs from FAA...</p>
              <p className="text-gray-400 text-sm mt-1">Please wait while we retrieve current NOTAMs</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-2xl">⚠️</span>
              </div>
              <p className="text-red-400 font-semibold mb-2">Error Loading NOTAMs</p>
              <p className="text-gray-400 text-sm">{error}</p>
            </div>
          ) : notamData && notamData.length > 0 ? (
            <div className="space-y-6">
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
                <div className="flex items-center justify-between">
                  <span className="text-cyan-400 font-semibold">Total NOTAMs Found: {notamData.length}</span>
                  <span className="text-gray-400 text-sm">Source: FAA NOTAM System</span>
                </div>
              </div>
              
              {notamData.map((notam, index) => {
                const typeDesc = getNotamTypeDescription(notam.classification);
                const isActive = notam.validFrom && notam.validTo ? 
                  (new Date() >= notam.validFrom && new Date() <= notam.validTo) : true;
                
                return (
                  <div key={index} className="bg-gray-900 rounded-lg border border-gray-600 overflow-hidden">
                    {/* NOTAM Header */}
                    <div className="bg-gray-800 px-4 py-3 border-b border-gray-600">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <span className="text-orange-400 font-bold text-lg">
                            {notam.number || `NOTAM ${index + 1}`}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            typeDesc === 'Runway' ? 'bg-red-600 text-white' :
                            typeDesc === 'Taxiway' ? 'bg-yellow-600 text-white' :
                            typeDesc === 'Navigation' ? 'bg-blue-600 text-white' :
                            typeDesc === 'Obstacles' ? 'bg-purple-600 text-white' :
                            'bg-gray-600 text-white'
                          }`}>
                            {typeDesc}
                          </span>
                          {isActive && (
                            <span className="px-2 py-1 bg-green-600 text-white text-xs rounded font-bold">
                              ACTIVE
                            </span>
                          )}
                          {notam.isPermanent && (
                            <span className="px-2 py-1 bg-orange-600 text-white text-xs rounded font-bold">
                              PERMANENT
                            </span>
                          )}
                        </div>
                        <div className="text-right text-gray-400 text-sm">
                          {notam.aLine && <div>Location: {notam.aLine}</div>}
                        </div>
                      </div>
                    </div>
                    
                    {/* NOTAM Body */}
                    <div className="p-4 space-y-4">
                      {/* Main Description */}
                      {notam.description && (
                        <div>
                          <h5 className="text-cyan-400 font-semibold mb-2">📝 Description</h5>
                          <div className="bg-gray-800 p-3 rounded border-l-4 border-orange-500">
                            <p className="text-gray-100 leading-relaxed">{notam.description}</p>
                          </div>
                        </div>
                      )}
                      
                      {/* Validity Period */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(notam.validFrom || notam.bLine) && (
                          <div>
                            <h6 className="text-green-400 font-semibold mb-1">⏰ Effective From</h6>
                            <p className="text-gray-200 bg-gray-800 p-2 rounded">
                              {notam.validFrom ? notam.validFrom.toLocaleString() : notam.bLine}
                            </p>
                          </div>
                        )}
                        
                        {(notam.validTo || notam.cLine) && (
                          <div>
                            <h6 className="text-red-400 font-semibold mb-1">⏰ Valid Until</h6>
                            <p className="text-gray-200 bg-gray-800 p-2 rounded">
                              {notam.isPermanent ? 'PERMANENT' : 
                               notam.validTo ? notam.validTo.toLocaleString() : notam.cLine}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {/* Schedule */}
                      {notam.schedule && (
                        <div>
                          <h6 className="text-blue-400 font-semibold mb-1">📅 Schedule</h6>
                          <p className="text-gray-200 bg-gray-800 p-2 rounded">{notam.schedule}</p>
                        </div>
                      )}
                      
                      {/* Technical Details */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
                        {notam.lowerLimit && (
                          <div>
                            <span className="text-gray-400 font-semibold">Lower Limit:</span>
                            <p className="text-gray-200">{notam.lowerLimit}</p>
                          </div>
                        )}
                        {notam.upperLimit && (
                          <div>
                            <span className="text-gray-400 font-semibold">Upper Limit:</span>
                            <p className="text-gray-200">{notam.upperLimit}</p>
                          </div>
                        )}
                        {notam.coordinates && (
                          <div>
                            <span className="text-gray-400 font-semibold">Coordinates:</span>
                            <p className="text-gray-200 font-mono">{notam.coordinates}</p>
                          </div>
                        )}
                      </div>
                      
                      {/* Raw NOTAM Text (Collapsible) */}
                      <details className="mt-4">
                        <summary className="cursor-pointer text-gray-400 hover:text-gray-200 font-semibold">
                          🔍 View Raw NOTAM Text
                        </summary>
                        <div className="mt-2 bg-black p-3 rounded border border-gray-700">
                          <pre className="text-green-300 text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                            {notam.rawText}
                          </pre>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-gray-400 text-2xl">📋</span>
              </div>
              <p className="text-gray-400 text-lg font-semibold mb-2">No NOTAMs Found</p>
              <p className="text-gray-500">No active NOTAMs are currently published for {icao}</p>
            </div>
          )}
        </div>
        
        {/* Footer - Fixed */}
        <div className="border-t border-gray-700 p-4 bg-gray-900 text-center" style={{ position: 'sticky', bottom: 0 }}>
          <p className="text-gray-400 text-sm">
            NOTAMs are retrieved from the FAA NOTAM Search System • 
            <span className="text-orange-400"> Always verify with official sources before flight</span>
          </p>
        </div>
      </div>
    </div>
  );
};

// Weather Tile Component with Backend API Integration
const WeatherTile = ({ 
  icao, 
  weatherMinima, 
  globalWeatherMinima, 
  setWeatherMinima, 
  resetWeatherMinima, 
  removeWeatherICAO,
  globalMinimized = false
}) => {
  const [metarRaw, setMetarRaw] = useState("");
  const [tafHtml, setTafHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [notamModalOpen, setNotamModalOpen] = useState(false);
  const [notamData, setNotamData] = useState([]);
  const [notamLoading, setNotamLoading] = useState(false);
  const [notamError, setNotamError] = useState(null);

  const storageKey = `weatherTileMin_${icao}`;
  const [minimized, setMinimized] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch (e) {
      return false;
    }
  });

  const effectiveMinimized = globalMinimized ? true : minimized;
  const min = weatherMinima[icao] || globalWeatherMinima;
  const usingDefault = !weatherMinima[icao];

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [taf, metar] = await Promise.all([
        fetchTAF(icao), 
        fetchMETAR(icao)
      ]);
      
      setMetarRaw(metar);
      
      if (taf) {
        const html = highlightTAFAllBelow(taf, min.ceiling, min.vis);
        setTafHtml(html);
      }
      
      setLoading(false);
    };
    
    fetchData();
    
    const intervalId = setInterval(fetchData, 300000);
    
    return () => clearInterval(intervalId);
  }, [icao, min.ceiling, min.vis]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, minimized ? '1' : '0');
    } catch (e) {
      // ignore storage errors
    }
  }, [minimized, storageKey]);

  const toggleMinimize = () => setMinimized(prev => !prev);

  // Fixed NOTAM fetch function using backend API
  const fetchNotamData = async () => {
    setNotamLoading(true);
    setNotamError(null);
    
    try {
      // Use the backend API endpoint instead of direct FAA API call
      const response = await fetch(`/api/notams?icao=${icao}`);
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else if (response.status === 400) {
          throw new Error('Invalid ICAO code provided.');
        } else if (response.status === 500) {
          throw new Error('Server error occurred while fetching NOTAMs.');
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      console.log('Backend API Response:', data); // Debug log
      
      // Process the NOTAM data from backend API
      const parsedNotams = [];
      
      if (Array.isArray(data)) {
        data.forEach(item => {
          // The backend already processes NOTAMs, so we can use them directly
          const notamText = item.body || item.summary || '';
          const parsed = parseNotamText(notamText);
          
          if (parsed) {
            // Merge backend data with parsed data
            parsed.number = item.number || parsed.number;
            parsed.icao = icao;
            parsed.classification = item.classification || parsed.classification;
            parsed.type = item.type || parsed.type;
            parsed.validFrom = item.validFrom || parsed.validFrom;
            parsed.validTo = item.validTo || parsed.validTo;
            parsed.summary = item.summary || parsed.description;
            parsed.location = item.location || parsed.aLine;
            parsed.qLine = item.qLine || parsed.qLine;
            parsed.source = 'Backend API (FAA Official)';
            parsedNotams.push(parsed);
          } else {
            // If parsing fails, create a simple NOTAM object from backend data
            parsedNotams.push({
              id: item.number || `${icao}-${Date.now()}`,
              number: item.number || '',
              icao: icao,
              classification: item.classification || '',
              type: item.type || '',
              validFrom: item.validFrom || '',
              validTo: item.validTo || '',
              description: item.summary || item.body || 'No description available',
              summary: item.summary || item.body || 'No summary available',
              rawText: item.body || item.summary || '',
              location: item.location || icao,
              qLine: item.qLine || '',
              source: 'Backend API (FAA Official)',
              aLine: item.location || icao,
              bLine: item.validFrom || '',
              cLine: item.validTo || '',
              isPermanent: item.validTo ? item.validTo.includes('PERM') : false
            });
          }
        });
      }
      
      setNotamData(parsedNotams);
      
    } catch (error) {
      console.error(`Error fetching NOTAMs for ${icao}:`, error);
      setNotamError(error.message);
      setNotamData([]);
    } finally {
      setNotamLoading(false);
    }
  };

  const handleNotamClick = () => {
    setNotamModalOpen(true);
    fetchNotamData();
  };

  const handleCloseNotamModal = () => {
    setNotamModalOpen(false);
    setNotamData([]);
    setNotamError(null);
  };

  const getBorderClass = () => {
    if (loading) return "border-gray-700";
    if (tafHtml && tafHtml.includes("text-red-400")) {
      return "border-red-500";
    }
    return "border-green-500";
  };

  return (
    <div 
      className={`relative bg-gray-800 rounded-xl shadow-md p-4 border-2 transition-all duration-300 hover:scale-105 ${getBorderClass()}`}
      style={effectiveMinimized ? { paddingTop: 8, paddingBottom: 8 } : undefined}
      aria-live="polite"
    >
      {/* Remove button */}
      <button 
        onClick={() => removeWeatherICAO(icao)} 
        type="button" 
        className="absolute top-2 right-2 z-10 bg-gray-900 border-none rounded-full w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white transition-all"
        title={`Remove ${icao}`}
        aria-label={`Remove ${icao}`}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 20 20">
          <path d="M5.5 14.5l9-9m-9 0l9 9" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Minimize toggle */}
      <button
        onClick={globalMinimized ? undefined : toggleMinimize}
        type="button"
        title={globalMinimized ? `Global minimize active` : (minimized ? `Expand ${icao} weather` : `Collapse ${icao} weather`)}
        aria-pressed={effectiveMinimized}
        aria-label={globalMinimized ? `Global minimize active` : `${minimized ? 'Expand' : 'Collapse'} ${icao} weather`}
        disabled={globalMinimized}
        className={`absolute left-2 top-2 ${globalMinimized ? 'bg-gray-600' : 'bg-gray-800'} text-gray-200 rounded-full w-8 h-8 flex items-center justify-center shadow border-2 border-gray-600`}
        style={{ zIndex: 12, opacity: globalMinimized ? 0.7 : 1, cursor: globalMinimized ? 'not-allowed' : 'pointer' }}
      >
        {effectiveMinimized ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 9l-6 6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Title */}
      <div className="text-2xl font-bold text-center text-cyan-300 tracking-wider">{icao}</div>

      {/* Minima controls */}
      <div className="flex gap-3 items-center mt-2 text-xs">
        <label className={`${usingDefault ? 'opacity-70 italic' : ''} text-gray-300`}>
          Ceil: 
          <input 
            type="number" 
            value={min.ceiling}
            className="bg-gray-700 p-1 rounded w-20 text-center ml-1 text-white"
            onChange={(e) => setWeatherMinima(icao, 'ceiling', e.target.value)}
            aria-label={`${icao} ceiling minima`}
          />
        </label>
        <label className={`${usingDefault ? 'opacity-70 italic' : ''} text-gray-300`}>
          Vis: 
          <input 
            type="number" 
            step="0.1" 
            value={min.vis}
            className="bg-gray-700 p-1 rounded w-20 text-center ml-1 text-white"
            onChange={(e) => setWeatherMinima(icao, 'vis', e.target.value)}
            aria-label={`${icao} visibility minima`}
          />
        </label>
        {usingDefault ? 
          <span className="opacity-70 italic text-gray-400">(default)</span> : 
          <button 
            className="text-yellow-400 underline text-xs hover:text-yellow-200" 
            onClick={() => resetWeatherMinima(icao)}
            aria-label={`Reset ${icao} minima`}
          >
            reset
          </button>
        }
      </div>

      {/* NOTAM Button */}
      <div className="mt-2 text-center">
        <button
          onClick={handleNotamClick}
          className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-sm font-semibold transition-colors"
          title={`View NOTAMs for ${icao}`}
        >
          📋 NOTAMs
        </button>
      </div>

      {/* Weather content */}
      {effectiveMinimized ? (
        <div className="mt-2 text-sm text-gray-300 flex items-center justify-center">
          <span className="px-2 py-1 bg-gray-900 rounded text-xs">
            Weather minimized — {globalMinimized ? 'global' : 'local'} view
          </span>
        </div>
      ) : (
        <>
          {loading && (
            <div className="mt-2 text-center">
              <div className="inline-block w-6 h-6 border-2 border-t-cyan-500 border-gray-600 rounded-full animate-spin"></div>
              <p className="text-sm text-gray-400 mt-1">Loading weather data...</p>
            </div>
          )}
          
          {metarRaw && (
            <div className="mt-2 text-xs text-gray-300">
              <strong className="text-cyan-400">METAR:</strong> 
              <div className="mt-1 bg-gray-900 p-2 rounded font-mono text-green-300">{metarRaw}</div>
            </div>
          )}
          
          {tafHtml && (
            <div className="mt-2 text-xs">
              <strong className="text-cyan-400">TAF:</strong>
              <div className="mt-1 bg-gray-900 p-2 rounded font-mono text-green-300" dangerouslySetInnerHTML={{ __html: tafHtml }}></div>
            </div>
          )}
        </>
      )}
      
      {/* NOTAM Modal */}
      <NotamModal 
        icao={icao}
        isOpen={notamModalOpen}
        onClose={handleCloseNotamModal}
        notamData={notamData}
        loading={notamLoading}
        error={notamError}
      />
    </div>
  );
};

// Main App Component
const WeatherMonitorApp = () => {
  // State variables
  const [globalWeatherMinima, setGlobalWeatherMinima] = useState(
    JSON.parse(localStorage.getItem("globalWeatherMinima") || '{"ceiling":500,"vis":1}')
  );
  
  const [weatherMinima, setWeatherMinima] = useState(
    JSON.parse(localStorage.getItem("weatherMinima") || "{}")
  );
  
  const [weatherICAOs, setWeatherICAOs] = useState(
    JSON.parse(localStorage.getItem("weatherICAOs") || "[]")
  );
  
  const [globalWeatherCeiling, setGlobalWeatherCeiling] = useState(globalWeatherMinima.ceiling);
  const [globalWeatherVis, setGlobalWeatherVis] = useState(globalWeatherMinima.vis);
  
  const [globalWeatherMinimized, setGlobalWeatherMinimized] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("globalWeatherMinimized") || "false");
    } catch (e) {
      return false;
    }
  });
  
  const icaoInputRef = useRef(null);

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem("globalWeatherMinima", JSON.stringify(globalWeatherMinima));
  }, [globalWeatherMinima]);

  useEffect(() => {
    localStorage.setItem("weatherMinima", JSON.stringify(weatherMinima));
  }, [weatherMinima]);

  useEffect(() => {
    localStorage.setItem("weatherICAOs", JSON.stringify(weatherICAOs));
  }, [weatherICAOs]);

  useEffect(() => {
    try {
      localStorage.setItem("globalWeatherMinimized", JSON.stringify(globalWeatherMinimized));
    } catch (e) {
      // ignore storage errors
    }
  }, [globalWeatherMinimized]);

  // Handler functions
  const handleSetWeatherMinima = (icao, field, value) => {
    setWeatherMinima(prev => ({
      ...prev,
      [icao]: {
        ...(prev[icao] || globalWeatherMinima),
        [field]: parseFloat(value)
      }
    }));
  };

  const handleResetWeatherMinima = (icao) => {
    setWeatherMinima(prev => {
      const newMinima = { ...prev };
      delete newMinima[icao];
      return newMinima;
    });
  };

  const handleApplyGlobalWeatherMinima = () => {
    const newGlobalMinima = {
      ceiling: parseFloat(globalWeatherCeiling),
      vis: parseFloat(globalWeatherVis)
    };
    setGlobalWeatherMinima(newGlobalMinima);
    setWeatherMinima({});
  };

  const handleAddWeatherICAO = () => {
    if (!icaoInputRef.current) return;
    
    const inputValue = icaoInputRef.current.value.toUpperCase();
    const icaos = inputValue
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length === 4 && /^[A-Z0-9]{4}$/.test(s));

    let added = false;
    const newIcaos = [...weatherICAOs];
    
    icaos.forEach(icao => {
      if (icao && !newIcaos.includes(icao)) {
        newIcaos.push(icao);
        added = true;
      }
    });
    
    if (added) {
      setWeatherICAOs(newIcaos);
    }
    
    icaoInputRef.current.value = "";
    icaoInputRef.current.focus();
  };

  const handleRemoveWeatherICAO = (icao) => {
    setWeatherICAOs(prev => prev.filter(i => i !== icao));
  };

  const handleIcaoInputKeyPress = (e) => {
    if (e.key === "Enter") handleAddWeatherICAO();
  };

  const toggleGlobalWeatherMinimize = () => {
    setGlobalWeatherMinimized(prev => !prev);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <Header />
      
      {/* Global Weather Minima Controls */}
      <div className="max-w-screen-2xl mx-auto px-6 mb-4">
        <div className="flex flex-wrap gap-2 sm:gap-4 justify-center items-center mb-2 bg-gray-800 rounded-lg p-4">
          <span className="font-bold text-cyan-300">Weather Minima:</span>
          <label className="text-gray-300">
            Ceil (ft):
            <input 
              type="number" 
              className="bg-gray-700 p-2 rounded w-20 text-center ml-2 text-white"
              value={globalWeatherCeiling}
              onChange={(e) => setGlobalWeatherCeiling(e.target.value)}
            />
          </label>
          <label className="text-gray-300">
            Vis (SM):
            <input 
              type="number" 
              step="0.1" 
              className="bg-gray-700 p-2 rounded w-20 text-center ml-2 text-white"
              value={globalWeatherVis}
              onChange={(e) => setGlobalWeatherVis(e.target.value)}
            />
          </label>
          <button 
            onClick={handleApplyGlobalWeatherMinima} 
            className="bg-green-600 px-4 py-2 rounded text-white hover:bg-green-700 transition-colors"
          >
            Set Default
          </button>
        </div>
      </div>
      
      {/* ICAO Input and Controls */}
      <div className="max-w-screen-2xl mx-auto px-6 mb-6">
        <div className="flex flex-wrap justify-center gap-2 mb-4 items-center bg-gray-800 rounded-lg p-4">
          <input 
            ref={icaoInputRef}
            placeholder="Enter ICAOs (e.g. CYYT,EGLL,KJFK)" 
            className="bg-gray-700 p-2 rounded text-center w-72 text-white placeholder-gray-400"
            onKeyPress={handleIcaoInputKeyPress}
          />
          <button 
            onClick={handleAddWeatherICAO} 
            className="bg-blue-600 px-4 py-2 rounded text-white hover:bg-blue-700 transition-colors"
          >
            Add ICAO(s)
          </button>

          <button
            onClick={toggleGlobalWeatherMinimize}
            className={`ml-2 px-4 py-2 rounded text-white transition-colors ${globalWeatherMinimized ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-gray-600 hover:bg-gray-500'}`}
            title={globalWeatherMinimized ? 'Expand all weather tiles' : 'Minimize all weather tiles'}
          >
            {globalWeatherMinimized ? 'Expand All' : 'Minimize Weather'}
          </button>
        </div>
      </div>
      
      {/* Weather Tiles Grid */}
      <div className="max-w-screen-2xl mx-auto px-6 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
          {weatherICAOs.map(icao => (
            <WeatherTile 
              key={icao}
              icao={icao}
              weatherMinima={weatherMinima}
              globalWeatherMinima={globalWeatherMinima}
              setWeatherMinima={handleSetWeatherMinima}
              resetWeatherMinima={handleResetWeatherMinima}
              removeWeatherICAO={handleRemoveWeatherICAO}
              globalMinimized={globalWeatherMinimized}
            />
          ))}
        </div>
        
        {weatherICAOs.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-4">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path>
              </svg>
              No weather stations added yet
            </div>
            <p className="text-gray-500">
              Add ICAO codes above to start monitoring weather conditions
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeatherMonitorApp;
