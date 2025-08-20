import React, { useState, useEffect, useRef } from 'react';

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

// Weather Tile Component
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
