// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const WeatherMonitorApp = () => {
  // Core state
  const [icaos, setIcaos] = useLocalStorage('weatherICAOs', []);
  const [globalMinima, setGlobalMinima] = useLocalStorage('globalWeatherMinima', { ceiling: 500, visibility: 1 });
  const [customMinima, setCustomMinima] = useLocalStorage('weatherMinima', {});
  const [globalMinimized, setGlobalMinimized] = useLocalStorage('globalWeatherMinimized', false);
  
  // Settings state
  const [settings, setSettings] = useLocalStorage('displaySettings', {
    tafFilterEnabled: true,
    metarFilterEnabled: false,
    borderColoringEnabled: true,
    colorScheme: 'classic',
    customColors: {
      above: 'text-green-400',
      below: 'text-red-400',
      base: 'text-green-400'
    }
  });

  // UI state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notamModal, setNotamModal] = useState({ isOpen: false, icao: null });
  const [icaoFilter, setIcaoFilter] = useState("");
  const [showFilteredOnly, setShowFilteredOnly] = useState(false);
  
  // Drag state
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragInsertPosition, setDragInsertPosition] = useState(null);

  const isMobile = useMediaQuery(`(max-width: ${CONFIG.MOBILE_BREAKPOINT}px)`);

  // Filtered ICAOs
  const filteredIcaos = useMemo(() => {
    if (!showFilteredOnly || !icaoFilter.trim()) {
      return icaos;
    }

    const filters = icaoFilter.toUpperCase().split(/[,\s]+/).filter(s => s.length > 0);
    return icaos.filter(icao => 
      filters.some(filter => icao.includes(filter) || filter.includes(icao))
    );
  }, [icaos, icaoFilter, showFilteredOnly]);

  // Handlers
  const handleAddIcao = useCallback((newIcaos) => {
    setIcaos(prev => {
      const existing = new Set(prev);
      const toAdd = newIcaos.filter(icao => !existing.has(icao));
      return [...prev, ...toAdd];
    });
  }, [setIcaos]);

  const handleRemoveIcao = useCallback((icao) => {
    setIcaos(prev => prev.filter(i => i !== icao));
    setCustomMinima(prev => {
      const newMinima = { ...prev };
      delete newMinima[icao];
      return newMinima;
    });
  }, [setIcaos, setCustomMinima]);

  const handleUpdateMinima = useCallback((icao, field, value) => {
    setCustomMinima(prev => ({
      ...prev,
      [icao]: {
        ...(prev[icao] || globalMinima),
        [field]: value
      }
    }));
  }, [setCustomMinima, globalMinima]);

  const handleResetMinima = useCallback((icao) => {
    setCustomMinima(prev => {
      const newMinima = { ...prev };
      delete newMinima[icao];
      return newMinima;
    });
  }, [setCustomMinima]);

  const handleApplyGlobalMinima = useCallback(() => {
    setCustomMinima({});
  }, [setCustomMinima]);

  const handleShowNotams = useCallback((icao) => {
    setNotamModal({ isOpen: true, icao });
  }, []);

  const handleCloseNotams = useCallback(() => {
    setNotamModal({ isOpen: false, icao: null });
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((icao) => {
    setDraggedItem(icao);
    setDragInsertPosition(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragInsertPosition(null);
  }, []);

  const handleReorder = useCallback((draggedIcao, targetIcao, insertAfter = false) => {
    if (draggedIcao === targetIcao) return;
    
    const newInsertPosition = { targetIcao, insertAfter };
    
    // Only update if position actually changed
    if (!dragInsertPosition || 
        dragInsertPosition.targetIcao !== newInsertPosition.targetIcao || 
        dragInsertPosition.insertAfter !== newInsertPosition.insertAfter) {
      setDragInsertPosition(newInsertPosition);
      
      // Immediately reorder the array for smooth visual feedback
      setIcaos(prev => {
        const newOrder = prev.filter(icao => icao !== draggedIcao);
        const targetIndex = newOrder.indexOf(targetIcao);
        
        if (targetIndex === -1) return prev;
        
        const insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
        newOrder.splice(insertIndex, 0, draggedIcao);
        
        return newOrder;
      });
    }
  }, [dragInsertPosition, setIcaos]);

  // Helper function to determine if a tile should show insertion space
  const shouldShowInsertionSpace = useCallback((icao, position) => {
    if (!dragInsertPosition || !draggedItem || icao === draggedItem) return false;
    
    if (position === 'before') {
      return dragInsertPosition.targetIcao === icao && !dragInsertPosition.insertAfter;
    } else if (position === 'after') {
      return dragInsertPosition.targetIcao === icao && dragInsertPosition.insertAfter;
    }
    
    return false;
  }, [dragInsertPosition, draggedItem]);

  // Helper functions moved inside component scope
  const getMetarColor = () => {
    if (!settings.metarFilterEnabled) return scheme.base.split(' ')[0];
    return metarMeetsMinima ? scheme.above.split(' ')[0] : scheme.below.split(' ')[0];
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ControlPanel
          onAddIcao={handleAddIcao}
          globalMinima={globalMinima}
          onUpdateGlobalMinima={setGlobalMinima}
          onApplyGlobalMinima={handleApplyGlobalMinima}
          globalMinimized={globalMinimized}
          onToggleGlobalMinimized={setGlobalMinimized}
          onOpenSettings={() => setSettingsOpen(true)}
          settings={settings}
          icaoFilter={icaoFilter}
          setIcaoFilter={setIcaoFilter}
          showFilteredOnly={showFilteredOnly}
          setShowFilteredOnly={setShowFilteredOnly}
          totalStations={icaos.length}
          filteredCount={filteredIcaos.length}
        />

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ControlPanel
          onAddIcao={handleAddIcao}
          globalMinima={globalMinima}
          onUpdateGlobalMinima={setGlobalMinima}
          onApplyGlobalMinima={handleApplyGlobalMinima}
          globalMinimized={globalMinimized}
          onToggleGlobalMinimized={setGlobalMinimized}
          onOpenSettings={() => setSettingsOpen(true)}
          settings={settings}
          icaoFilter={icaoFilter}
          setIcaoFilter={setIcaoFilter}
          showFilteredOnly={showFilteredOnly}
          setShowFilteredOnly={setShowFilteredOnly}
          totalStations={icaos.length}
          filteredCount={filteredIcaos.length}
        />

        {/* Weather Tiles Grid */}
        {filteredIcaos.length > 0 ? (
          <div className={`grid gap-4 pb-8 ${
            isMobile 
              ? 'grid-cols-1' 
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
          }`}>
            {filteredIcaos.map((icao) => {
              const minima = customMinima[icao] || globalMinima;
              const isGlobalMinima = !customMinima[icao];
              
              return (
                <div key={`${icao}-container`} className="relative transition-all duration-300 ease-out">
                  {/* Enhanced insertion space indicator before */}
                  {shouldShowInsertionSpace(icao, 'before') && (
                    <div className="absolute -left-4 top-0 bottom-0 w-2 bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400 rounded-full shadow-lg shadow-cyan-400/50 animate-pulse" />
                  )}
                  
                  {/* Drop zone overlay for better visual feedback */}
                  {draggedItem && icao !== draggedItem && (
                    <div className="absolute inset-0 rounded-xl border-2 border-dashed border-cyan-400/30 bg-cyan-400/5 opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
                  )}
                  
                  <WeatherTile
                    icao={icao}
                    minima={minima}
                    isGlobalMinima={isGlobalMinima}
                    onUpdateMinima={(field, value) => handleUpdateMinima(icao, field, value)}
                    onResetMinima={() => handleResetMinima(icao)}
                    onRemove={() => handleRemoveIcao(icao)}
                    globalMinimized={globalMinimized}
                    onToggleMinimize={() => {}} // Individual minimize handled in WeatherTile
                    settings={settings}
                    onShowNotams={() => handleShowNotams(icao)}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onReorder={handleReorder}
                    draggedItem={draggedItem}
                  />
                  
                  {/* Enhanced insertion space indicator after */}
                  {shouldShowInsertionSpace(icao, 'after') && (
                    <div className="absolute -right-4 top-0 bottom-0 w-2 bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400 rounded-full shadow-lg shadow-cyan-400/50 animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>
        ) : icaos.length > 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-gray-400 text-2xl">🔍</span>
            </div>
            <h3 className="text-xl text-gray-400 font-semibold mb-2">No Matching Stations</h3>
            <p className="text-gray-500 mb-4">
              Filter "{icaoFilter}" matches 0 of {icaos.length} stations
            </p>
            <button
              onClick={() => {
                setIcaoFilter("");
                setShowFilteredOnly(false);
              }}
              className="bg-cyan-600 hover:bg-cyan-700 px-6 py-2 rounded text-white transition-colors"
            >
              Clear Filter
            </button>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-gray-400 text-3xl">🌤️</span>
            </div>
            <h3 className="text-2xl text-gray-400 font-semibold mb-4">Welcome to Weather Monitor</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Add ICAO weather station codes to start monitoring aviation weather conditions with customizable minima thresholds.
            </p>
            <div className="bg-gray-800 rounded-lg p-4 max-w-sm mx-auto">
              <h4 className="text-cyan-400 font-semibold mb-2">Example Stations:</h4>
              <div className="text-sm text-gray-300 space-y-1">
                <div>🇺🇸 KJFK - New York JFK</div>
                <div>🇬🇧 EGLL - London Heathrow</div>
                <div>🇨🇦 CYYT - St. John's</div>
                <div>🇩🇪 EDDF - Frankfurt</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
      />

      <NotamModal
        isOpen={notamModal.isOpen}
        onClose={handleCloseNotams}
        icao={notamModal.icao}
      />
    </div>
  );
};

export default WeatherMonitorApp;const NotamModal = ({ isOpen, onClose, icao }) => {
  const [notamData, setNotamData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !icao) return;
    
    const fetchNotams = async () => {
      setLoading(true);
      setError(null);
      
      try {
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
        
        // Process and sort NOTAMs by priority
        const processedNotams = Array.isArray(data) ? data.map(item => {
          const summary = item.summary || item.body || item.description || '';
          return {
            number: item.number || '',
            type: item.type || '',
            classification: item.classification || '',
            icao: icao,
            location: item.location || icao,
            validFrom: item.validFrom || '',
            validTo: item.validTo || '',
            summary: summary,
            body: item.body || summary,
            qLine: item.qLine || '',
            isPermanent: item.validTo ? item.validTo.includes('PERM') : false,
            isActive: (() => {
              if (!item.validFrom || !item.validTo) return true;
              const now = new Date();
              const from = new Date(item.validFrom);
              const to = new Date(item.validTo);
              return now >= from && now <= to;
            })(),
            priority: (() => {
              const text = summary.toLowerCase();
              if (text.includes('clsd') || text.includes('closed')) return 1; // Highest priority
              if (text.includes('rsc')) return 2;
              if (text.includes('crfi')) return 3;
              if (text.includes('runway') || text.includes('rwy')) return 4;
              return 5; // Default priority
            })()
          };
        }).sort((a, b) => {
          // Sort by priority first, then by effective date
          if (a.priority !== b.priority) return a.priority - b.priority;
          try {
            return new Date(b.validFrom || 0) - new Date(a.validFrom || 0);
          } catch {
            return 0;
          }
        }) : [];
        
        setNotamData(processedNotams);
      } catch (err) {
        console.error(`Error fetching NOTAMs for ${icao}:`, err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchNotams();
  }, [isOpen, icao]);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not specified';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short'
      });
    } catch {
      return dateStr;
    }
  };

  const getNotamPriorityColor = (priority) => {
    switch (priority) {
      case 1: return 'bg-red-600'; // Closures
      case 2: return 'bg-orange-600'; // RSC
      case 3: return 'bg-yellow-600'; // CRFI
      case 4: return 'bg-purple-600'; // Runway related
      default: return 'bg-gray-600';
    }
  };

  const cleanNotamText = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return rawText;
    
    // Handle CFPS JSON response format
    if (rawText.includes('"raw"') && rawText.includes('"english"')) {
      try {
        const jsonData = JSON.parse(rawText);
        if (jsonData.raw) return jsonData.raw.replace(/\\n/g, '\n');
        if (jsonData.english) return jsonData.english.replace(/\\n/g, '\n');
      } catch (e) {
        const rawMatch = rawText.match(/"raw"\s*:\s*"([^"]+)"/);
        if (rawMatch) return rawMatch[1].replace(/\\n/g, '\n');
        
        const englishMatch = rawText.match(/"english"\s*:\s*"([^"]+)"/);
        if (englishMatch) return englishMatch[1].replace(/\\n/g, '\n');
      }
    }
    
    return rawText.replace(/\\n/g, '\n');
  };

  return (
    <MobileOptimizedModal isOpen={isOpen} onClose={onClose} title={`NOTAMs for ${icao}`}>
      {loading ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 border-4 border-t-orange-500 border-gray-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xl text-orange-400 font-semibold mb-2">Fetching NOTAMs from FAA...</p>
          <p className="text-gray-400">Please wait while we retrieve current NOTAMs</p>
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-white text-3xl">⚠️</span>
          </div>
          <h4 className="text-xl text-red-400 font-semibold mb-3">Error Loading NOTAMs</h4>
          <p className="text-gray-400 mb-4">{error}</p>
          <button 
            onClick={onClose}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      ) : notamData.length > 0 ? (
        <div className="space-y-6">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-cyan-400 font-semibold text-lg">
                📊 Total NOTAMs Found: {notamData.length}
              </span>
              <span className="text-gray-400 text-sm">
                🔗 Source: FAA NOTAM System • Updated: {new Date().toLocaleTimeString()}
              </span>
            </div>
          </div>
          
          {notamData.map((notam, index) => {
            const priorityColor = getNotamPriorityColor(notam.priority);
            return (
              <div key={index} className="bg-gray-900 rounded-lg border border-gray-600 overflow-hidden hover:border-gray-500 transition-colors">
                <div className="bg-gray-800 px-6 py-4 border-b border-gray-600">
                  <div className="flex justify-between items-start flex-wrap gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-orange-400 font-bold text-xl">
                        {notam.number || `NOTAM ${index + 1}`}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${priorityColor}`}>
                        {notam.type || 'GENERAL'}
                      </span>
                      {notam.isActive && (
                        <span className="px-3 py-1 bg-green-600 text-white text-xs rounded-full font-bold animate-pulse">
                          ● ACTIVE
                        </span>
                      )}
                      {notam.isPermanent && (
                        <span className="px-3 py-1 bg-orange-600 text-white text-xs rounded-full font-bold">
                          PERMANENT
                        </span>
                      )}
                    </div>
                    <div className="text-right text-gray-400 text-sm">
                      {notam.location && (
                        <div className="flex items-center gap-1">
                          <span>📍</span>
                          <span>{notam.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="p-6 space-y-5">
                  {notam.summary && (
                    <div>
                      <h5 className="text-cyan-400 font-semibold mb-3 flex items-center gap-2">
                        <span>📝</span>
                        Description
                      </h5>
                      <div className="bg-gray-800 p-4 rounded-lg border-l-4 border-orange-500">
                        <p className="text-gray-100 leading-relaxed text-base">
                          {notam.summary}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {notam.validFrom && (
                      <div className="bg-gray-800 p-4 rounded-lg">
                        <h6 className="text-green-400 font-semibold mb-2 flex items-center gap-2">
                          <span>🟢</span>
                          Effective From
                        </h6>
                        <p className="text-gray-200 font-mono text-sm">
                          {formatDate(notam.validFrom)}
                        </p>
                      </div>
                    )}
                    {notam.validTo && (
                      <div className="bg-gray-800 p-4 rounded-lg">
                        <h6 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
                          <span>🔴</span>
                          Valid Until
                        </h6>
                        <p className="text-gray-200 font-mono text-sm">
                          {notam.isPermanent ? 'PERMANENT' : formatDate(notam.validTo)}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {notam.body && notam.body !== notam.summary && (
                    <details className="group">
                      <summary className="cursor-pointer text-gray-400 hover:text-gray-200 font-semibold flex items-center gap-2 p-2 bg-gray-800 rounded transition-colors group-open:bg-gray-700">
                        <span className="transform group-open:rotate-90 transition-transform">▶</span>
                        🔍 View Raw NOTAM Text
                      </summary>
                      <div className="mt-3 bg-black p-4 rounded border border-gray-700">
                        <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">
                          {cleanNotamText(notam.body)}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-gray-400 text-3xl">📋</span>
          </div>
          <h4 className="text-xl text-gray-400 font-semibold mb-3">No NOTAMs Found</h4>
          <p className="text-gray-500 mb-6">No active NOTAMs are currently published for {icao}</p>
          <p className="text-gray-600 text-sm">This usually means favorable conditions with no restrictions</p>
        </div>
      )}
      
      <div className="mt-6 pt-4 border-t border-gray-700 text-center">
        <p className="text-gray-400 text-sm">
          📡 NOTAMs retrieved from FAA NOTAM Search System • 
          <span className="text-orange-400 font-semibold"> Always verify with official sources before flight</span>
        </p>
      </div>
    </MobileOptimizedModal>
  );
};import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const CONFIG = {
  TAF_CACHE_MS: 600000, // 10 minutes
  METAR_CACHE_MS: 60000, // 1 minute
  CORS_PROXY: "https://corsproxy.io/?",
  REFRESH_INTERVAL: 300000, // 5 minutes
  LONG_PRESS_DURATION: 600, // ms
  MOBILE_BREAKPOINT: 768, // px
};

const COLOR_SCHEMES = {
  classic: {
    name: 'Classic Green/Red',
    above: 'text-green-400 border-green-500',
    below: 'text-red-400 border-red-500',
    base: 'text-green-400'
  },
  aviation: {
    name: 'Aviation Blue/Amber',
    above: 'text-blue-400 border-blue-500',
    below: 'text-yellow-400 border-yellow-500',
    base: 'text-blue-400'
  },
  modern: {
    name: 'Modern Cyan/Orange',
    above: 'text-cyan-400 border-cyan-500',
    below: 'text-orange-400 border-orange-500',
    base: 'text-cyan-400'
  },
  highContrast: {
    name: 'High Contrast',
    above: 'text-white border-gray-300',
    below: 'text-red-500 border-red-600',
    base: 'text-white'
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const useLocalStorage = (key, defaultValue) => {
  const [value, setValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setStoredValue = useCallback((newValue) => {
    try {
      setValue(newValue);
      localStorage.setItem(key, JSON.stringify(newValue));
    } catch (error) {
      console.error(`Error saving to localStorage:`, error);
    }
  }, [key]);

  return [value, setStoredValue];
};

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addListener(listener);
    return () => media.removeListener(listener);
  }, [matches, query]);

  return matches;
};

const weatherCache = {};

const fetchWeatherData = async (type, icao) => {
  if (!icao) return "";
  
  const cacheKey = `${type}_${icao}`;
  const maxAge = type === 'taf' ? CONFIG.TAF_CACHE_MS : CONFIG.METAR_CACHE_MS;
  const cached = weatherCache[cacheKey];
  
  if (cached && (Date.now() - cached.time < maxAge)) {
    return cached.data;
  }
  
  try {
    const url = `${CONFIG.CORS_PROXY}https://aviationweather.gov/cgi-bin/data/${type}.php?ids=${icao}&format=raw`;
    const response = await fetch(url);
    const text = (await response.text()).trim();
    
    weatherCache[cacheKey] = { data: text, time: Date.now() };
    return text;
  } catch (error) {
    console.error(`Error fetching ${type.toUpperCase()} for ${icao}:`, error);
    return "";
  }
};

const parseWeatherConditions = (line) => {
  if (!line || typeof line !== 'string') {
    return { ceiling: Infinity, visibility: Infinity, isGreater: false, isLess: false };
  }

  const text = line.replace(/\u00A0/g, ' ').toUpperCase();
  let ceiling = Infinity;
  let visibility = Infinity;
  let isGreater = false;
  let isLess = false;

  // Parse ceiling
  const ceilingMatch = text.match(/(BKN|OVC|VV)\s*(\d{3})/);
  if (ceilingMatch) {
    ceiling = parseInt(ceilingMatch[2], 10) * 100;
  }

  // Parse visibility with enhanced handling
  const visMatch = text.match(/\b([PM])?\s*((\d{1,2})\s+(\d{1,2}\/\d{1,2})|(\d{1,2}\/\d{1,2})|(\d{1,2}))\s*SM\b/i);
  if (visMatch) {
    const prefix = (visMatch[1] || '').toUpperCase();
    
    if (prefix === 'P') {
      isGreater = true;
      visibility = Infinity; // Greater than reported value
    } else if (prefix === 'M') {
      isLess = true;
      visibility = 0; // Less than reported value
    } else {
      if (visMatch[3] && visMatch[4]) {
        // Whole number plus fraction
        const whole = parseInt(visMatch[3], 10);
        const [num, den] = visMatch[4].split('/').map(Number);
        if (den > 0) visibility = whole + (num / den);
      } else if (visMatch[5]) {
        // Just fraction
        const [num, den] = visMatch[5].split('/').map(Number);
        if (den > 0) visibility = num / den;
      } else if (visMatch[6]) {
        // Just whole number
        visibility = parseInt(visMatch[6], 10);
      }
    }
  }

  if (!isFinite(visibility)) visibility = Infinity;

  return { ceiling, visibility, isGreater, isLess };
};

const checkMeetsMinima = (conditions, minima) => {
  // Handle special cases for visibility
  if (conditions.isGreater) {
    // P6SM means greater than 6SM, so always meets visibility minima
    return conditions.ceiling >= minima.ceiling;
  }
  
  if (conditions.isLess) {
    // M1/4SM means less than 1/4SM, so likely doesn't meet minima
    return false;
  }
  
  return conditions.ceiling >= minima.ceiling && conditions.visibility >= minima.visibility;
};

const formatTAFWithColors = (tafText, minima, colorScheme, filterEnabled) => {
  if (!tafText) return "";
  
  const scheme = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.classic;
  
  return tafText.split('\n').map((line, index) => {
    const conditions = parseWeatherConditions(line);
    const meetsMinima = checkMeetsMinima(conditions, minima);
    
    if (!filterEnabled) {
      return `<div key="${index}" class="${scheme.base}">${line}</div>`;
    }
    
    const colorClass = meetsMinima ? scheme.above.split(' ')[0] : scheme.below.split(' ')[0];
    const fontWeight = meetsMinima ? '' : 'font-bold';
    
    return `<div key="${index}" class="${colorClass} ${fontWeight}">${line}</div>`;
  }).join('');
};

// ============================================================================
// COMPONENTS
// ============================================================================

const Header = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const localTime = currentTime.toLocaleTimeString();
  const utcTime = currentTime.toUTCString().slice(17, 25) + ' UTC';

  return (
    <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 p-4 mb-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-cyan-400 mb-2">
            Weather Monitor Dashboard
          </h1>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-8 text-sm sm:text-base font-mono">
            <div className="text-gray-200 font-semibold">{localTime} Local</div>
            <div className="text-cyan-400 font-semibold">{utcTime}</div>
          </div>
        </div>
      </div>
    </header>
  );
};

const MobileOptimizedModal = ({ isOpen, onClose, title, children }) => {
  const modalRef = useRef(null);
  const isMobile = useMediaQuery(`(max-width: ${CONFIG.MOBILE_BREAKPOINT}px)`);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div 
        ref={modalRef}
        className={`
          relative bg-gray-800 rounded-xl border border-gray-600 shadow-2xl
          w-full max-w-4xl max-h-[90vh] flex flex-col
          ${isMobile ? 'mx-2' : 'mx-4'}
        `}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-cyan-400">{title}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

const SettingsModal = ({ 
  isOpen, 
  onClose, 
  settings, 
  onUpdateSettings 
}) => {
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  const handleSave = () => {
    onUpdateSettings(localSettings);
    onClose();
  };

  const updateSetting = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const ColorPicker = ({ label, value, onChange }) => {
    const baseColors = [
      { name: 'Red', value: 'text-red-400', color: '#f87171' },
      { name: 'Orange', value: 'text-orange-400', color: '#fb923c' },
      { name: 'Yellow', value: 'text-yellow-400', color: '#facc15' },
      { name: 'Green', value: 'text-green-400', color: '#4ade80' },
      { name: 'Blue', value: 'text-blue-400', color: '#60a5fa' },
      { name: 'Cyan', value: 'text-cyan-400', color: '#22d3ee' },
      { name: 'Purple', value: 'text-purple-400', color: '#a78bfa' },
      { name: 'Pink', value: 'text-pink-400', color: '#f472b6' },
      { name: 'White', value: 'text-white', color: '#ffffff' },
      { name: 'Gray', value: 'text-gray-300', color: '#d1d5db' }
    ];

    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-300">{label}</label>
        <div className="flex flex-wrap gap-1">
          {baseColors.map(color => (
            <button
              key={color.value}
              onClick={() => onChange(color.value)}
              className={`w-8 h-8 rounded border-2 transition-all duration-200 hover:scale-110 ${
                value === color.value ? 'border-white shadow-md' : 'border-gray-600'
              }`}
              style={{ backgroundColor: color.color }}
              title={color.name}
            />
          ))}
        </div>
      </div>
    );
  };

  // Add custom color scheme to available schemes
  const availableSchemes = {
    ...COLOR_SCHEMES,
    custom: {
      name: 'Custom Colors',
      above: localSettings.customColors?.above || 'text-green-400 border-green-500',
      below: localSettings.customColors?.below || 'text-red-400 border-red-500',
      base: localSettings.customColors?.base || 'text-green-400'
    }
  };

  return (
    <MobileOptimizedModal isOpen={isOpen} onClose={onClose} title="Display Settings">
      <div className="space-y-6">
        {/* Filter Settings */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-cyan-300 mb-4">Weather Minima Filters</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-gray-300">TAF Color Coding</span>
                <p className="text-sm text-gray-400 mt-1">
                  {localSettings.tafFilterEnabled 
                    ? 'TAF lines below minima will be highlighted in warning colors'
                    : 'All TAF text will use the same base color regardless of conditions'
                  }
                </p>
              </div>
              <button
                onClick={() => updateSetting('tafFilterEnabled', !localSettings.tafFilterEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  localSettings.tafFilterEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  localSettings.tafFilterEnabled ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-gray-300">METAR Color Coding</span>
                <p className="text-sm text-gray-400 mt-1">
                  {localSettings.metarFilterEnabled 
                    ? 'METAR text below minima will be highlighted in warning colors'
                    : 'METAR text will use the base color regardless of conditions'
                  }
                </p>
              </div>
              <button
                onClick={() => updateSetting('metarFilterEnabled', !localSettings.metarFilterEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  localSettings.metarFilterEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  localSettings.metarFilterEnabled ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-gray-300">Border Color Coding</span>
                <p className="text-sm text-gray-400 mt-1">
                  {localSettings.borderColoringEnabled 
                    ? 'Tile borders will match your selected color scheme (above/below minima colors)'
                    : 'All tile borders will be neutral gray'
                  }
                </p>
              </div>
              <button
                onClick={() => updateSetting('borderColoringEnabled', !localSettings.borderColoringEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  localSettings.borderColoringEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  localSettings.borderColoringEnabled ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>
        </div>

        {/* Color Scheme */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-cyan-300 mb-4">Color Schemes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(availableSchemes).map(([key, scheme]) => (
              <button
                key={key}
                onClick={() => updateSetting('colorScheme', key)}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  localSettings.colorScheme === key 
                    ? 'border-cyan-400 bg-gray-800' 
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <div className="font-medium text-gray-200 mb-2">{scheme.name}</div>
                <div className="flex gap-2 text-xs">
                  <span className={`${scheme.above.split(' ')[0]} bg-gray-700 px-2 py-1 rounded`}>
                    Above Minima
                  </span>
                  <span className={`${scheme.below.split(' ')[0]} bg-gray-700 px-2 py-1 rounded font-bold`}>
                    Below Minima
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Colors (only show if custom scheme is selected) */}
        {localSettings.colorScheme === 'custom' && (
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-cyan-300 mb-4">Custom Color Configuration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ColorPicker
                label="Above Minima Color"
                value={localSettings.customColors?.above || 'text-green-400'}
                onChange={(color) => updateSetting('customColors', {
                  ...localSettings.customColors,
                  above: color,
                  aboveWithBorder: `${color} ${color.replace('text-', 'border-')}`
                })}
              />
              <ColorPicker
                label="Below Minima Color"
                value={localSettings.customColors?.below || 'text-red-400'}
                onChange={(color) => updateSetting('customColors', {
                  ...localSettings.customColors,
                  below: color,
                  belowWithBorder: `${color} ${color.replace('text-', 'border-')}`
                })}
              />
              <ColorPicker
                label="Base Text Color"
                value={localSettings.customColors?.base || 'text-green-400'}
                onChange={(color) => updateSetting('customColors', {
                  ...localSettings.customColors,
                  base: color
                })}
              />
            </div>
            
            {/* Custom Color Preview */}
            <div className="mt-4 p-3 bg-black rounded border border-gray-700">
              <div className="text-sm text-gray-400 mb-2">Preview:</div>
              <div className={`${localSettings.customColors?.base || 'text-green-400'} font-mono text-sm mb-1`}>
                METAR KJFK 012351Z 26008KT 10SM FEW250 10/M06 A3012
              </div>
              <div className={`${localSettings.customColors?.above || 'text-green-400'} font-mono text-sm mb-1`}>
                TAF Line Above Minima: 1000 OVC 6SM -SN
              </div>
              <div className={`${localSettings.customColors?.below || 'text-red-400'} font-mono text-sm font-bold`}>
                TAF Line Below Minima: 200 OVC 1/2SM +SN
              </div>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-center pt-4">
          <button
            onClick={handleSave}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Apply Settings
          </button>
        </div>
      </div>
    </MobileOptimizedModal>
  );
};

const NotamModal = ({ isOpen, onClose, icao }) => {
  const [notamData, setNotamData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !icao) return;
    
    const fetchNotams = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/notams?icao=${icao}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        setNotamData(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(`Error fetching NOTAMs for ${icao}:`, err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchNotams();
  }, [isOpen, icao]);

  return (
    <MobileOptimizedModal isOpen={isOpen} onClose={onClose} title={`NOTAMs for ${icao}`}>
      {loading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-t-orange-500 border-gray-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-orange-400 font-semibold">Fetching NOTAMs...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl">⚠️</span>
          </div>
          <h3 className="text-xl text-red-400 font-semibold mb-2">Error Loading NOTAMs</h3>
          <p className="text-gray-400">{error}</p>
        </div>
      ) : notamData.length > 0 ? (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg p-3 text-center">
            <span className="text-cyan-300 font-semibold">Global Minima:</span>
        <div className="flex gap-2 items-center">
          <label className="text-gray-300 text-sm">
            Ceiling:
            <input
              type="number"
              value={globalCeiling}
              onChange={(e) => setGlobalCeiling(e.target.value)}
              className="bg-gray-700 rounded px-2 py-1 w-20 text-center ml-1 text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              min="0"
              step="100"
            />
          </label>
          <label className="text-gray-300 text-sm">
            Visibility:
            <input
              type="number"
              value={globalVis}
              onChange={(e) => setGlobalVis(e.target.value)}
              className="bg-gray-700 rounded px-2 py-1 w-20 text-center ml-1 text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              min="0"
              step="0.1"
            />
          </label>
          <button
            onClick={handleApplyGlobal}
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white text-sm font-medium transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* ICAO Input */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-center">
        <input
          type="text"
          value={icaoInput}
          onChange={(e) => setIcaoInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddIcao()}
          placeholder="Add ICAOs (e.g. CYYT,EGLL,KJFK)"
          className={`bg-gray-700 rounded px-4 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none ${
            isMobile ? 'w-full' : 'w-80'
          }`}
        />
        <div className="flex gap-2">
          <button
            onClick={handleAddIcao}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white font-medium transition-colors"
          >
            Add Station{icaoInput.includes(',') ? 's' : ''}
          </button>
          <button
            onClick={onToggleGlobalMinimized}
            className={`px-4 py-2 rounded text-white font-medium transition-colors ${
              globalMinimized ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'
            }`}
          >
            {globalMinimized ? 'Expand All' : 'Minimize All'}
          </button>
          <button
            onClick={onOpenSettings}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-white font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {isMobile ? '' : 'Settings'}
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-center">
        <div className="flex items-center gap-2">
          <span className="text-gray-300 text-sm">🔍 Filter:</span>
          <input
            type="text"
            value={icaoFilter}
            onChange={(e) => setIcaoFilter(e.target.value)}
            placeholder="Filter stations..."
            className={`bg-gray-700 rounded px-3 py-1.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-sm ${
              isMobile ? 'w-full' : 'w-48'
            }`}
          />
          <button
            onClick={() => setShowFilteredOnly(!showFilteredOnly)}
            className={`px-3 py-1.5 rounded text-white text-sm font-medium transition-colors ${
              showFilteredOnly ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-gray-600 hover:bg-gray-700'
            }`}
          >
            {showFilteredOnly ? 'Active' : 'Apply'}
          </button>
          {(icaoFilter || showFilteredOnly) && (
            <button
              onClick={() => {
                setIcaoFilter("");
                setShowFilteredOnly(false);
              }}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white text-sm transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        
        <div className="text-sm text-gray-400">
          Showing {filteredCount} of {totalStations} stations
        </div>
      </div>

      {/* Status Indicators */}
      <div className="flex flex-wrap justify-center gap-2 text-xs">
        <span className={`px-2 py-1 rounded ${settings.tafFilterEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
          TAF: {settings.tafFilterEnabled ? 'ON' : 'OFF'}
        </span>
        <span className={`px-2 py-1 rounded ${settings.metarFilterEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
          METAR: {settings.metarFilterEnabled ? 'ON' : 'OFF'}
        </span>
        <span className={`px-2 py-1 rounded ${settings.borderColoringEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
          Borders: {settings.borderColoringEnabled ? 'ON' : 'OFF'}
        </span>
        <span className="px-2 py-1 bg-purple-600 text-white rounded">
          {COLOR_SCHEMES[settings.colorScheme]?.name || 'Unknown'}
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const WeatherMonitorApp = () => {
  // Core state
  const [icaos, setIcaos] = useLocalStorage('weatherICAOs', []);
  const [globalMinima, setGlobalMinima] = useLocalStorage('globalWeatherMinima', { ceiling: 500, visibility: 1 });
  const [customMinima, setCustomMinima] = useLocalStorage('weatherMinima', {});
  const [globalMinimized, setGlobalMinimized] = useLocalStorage('globalWeatherMinimized', false);
  
  // Settings state
  const [settings, setSettings] = useLocalStorage('displaySettings', {
    tafFilterEnabled: true,
    metarFilterEnabled: false,
    borderColoringEnabled: true,
    colorScheme: 'classic'
  });

  // UI state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notamModal, setNotamModal] = useState({ isOpen: false, icao: null });
  const [icaoFilter, setIcaoFilter] = useState("");
  const [showFilteredOnly, setShowFilteredOnly] = useState(false);

  const isMobile = useMediaQuery(`(max-width: ${CONFIG.MOBILE_BREAKPOINT}px)`);

  // Filtered ICAOs
  const filteredIcaos = useMemo(() => {
    if (!showFilteredOnly || !icaoFilter.trim()) {
      return icaos;
    }

    const filters = icaoFilter.toUpperCase().split(/[,\s]+/).filter(s => s.length > 0);
    return icaos.filter(icao => 
      filters.some(filter => icao.includes(filter) || filter.includes(icao))
    );
  }, [icaos, icaoFilter, showFilteredOnly]);

  // Handlers
  const handleAddIcao = useCallback((newIcaos) => {
    setIcaos(prev => {
      const existing = new Set(prev);
      const toAdd = newIcaos.filter(icao => !existing.has(icao));
      return [...prev, ...toAdd];
    });
  }, [setIcaos]);

  const handleRemoveIcao = useCallback((icao) => {
    setIcaos(prev => prev.filter(i => i !== icao));
    setCustomMinima(prev => {
      const newMinima = { ...prev };
      delete newMinima[icao];
      return newMinima;
    });
  }, [setIcaos, setCustomMinima]);

  const handleUpdateMinima = useCallback((icao, field, value) => {
    setCustomMinima(prev => ({
      ...prev,
      [icao]: {
        ...(prev[icao] || globalMinima),
        [field]: value
      }
    }));
  }, [setCustomMinima, globalMinima]);

  const handleResetMinima = useCallback((icao) => {
    setCustomMinima(prev => {
      const newMinima = { ...prev };
      delete newMinima[icao];
      return newMinima;
    });
  }, [setCustomMinima]);

  const handleApplyGlobalMinima = useCallback(() => {
    setCustomMinima({});
  }, [setCustomMinima]);

  const handleShowNotams = useCallback((icao) => {
    setNotamModal({ isOpen: true, icao });
  }, []);

  const handleCloseNotams = useCallback(() => {
    setNotamModal({ isOpen: false, icao: null });
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ControlPanel
          onAddIcao={handleAddIcao}
          globalMinima={globalMinima}
          onUpdateGlobalMinima={setGlobalMinima}
          onApplyGlobalMinima={handleApplyGlobalMinima}
          globalMinimized={globalMinimized}
          onToggleGlobalMinimized={setGlobalMinimized}
          onOpenSettings={() => setSettingsOpen(true)}
          settings={settings}
          icaoFilter={icaoFilter}
          setIcaoFilter={setIcaoFilter}
          showFilteredOnly={showFilteredOnly}
          setShowFilteredOnly={setShowFilteredOnly}
          totalStations={icaos.length}
          filteredCount={filteredIcaos.length}
        />

        {/* Weather Tiles Grid */}
        {filteredIcaos.length > 0 ? (
          <div className={`grid gap-4 pb-8 ${
            isMobile 
              ? 'grid-cols-1' 
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
          }`}>
            {filteredIcaos.map(icao => {
              const minima = customMinima[icao] || globalMinima;
              const isGlobalMinima = !customMinima[icao];
              
              return (
                <WeatherTile
                  key={icao}
                  icao={icao}
                  minima={minima}
                  isGlobalMinima={isGlobalMinima}
                  onUpdateMinima={(field, value) => handleUpdateMinima(icao, field, value)}
                  onResetMinima={() => handleResetMinima(icao)}
                  onRemove={() => handleRemoveIcao(icao)}
                  isMinimized={globalMinimized}
                  onToggleMinimize={() => {}} // Individual minimize disabled for simplicity
                  settings={settings}
                  onShowNotams={() => handleShowNotams(icao)}
                />
              );
            })}
          </div>
        ) : icaos.length > 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-gray-400 text-2xl">🔍</span>
            </div>
            <h3 className="text-xl text-gray-400 font-semibold mb-2">No Matching Stations</h3>
            <p className="text-gray-500 mb-4">
              Filter "{icaoFilter}" matches 0 of {icaos.length} stations
            </p>
            <button
              onClick={() => {
                setIcaoFilter("");
                setShowFilteredOnly(false);
              }}
              className="bg-cyan-600 hover:bg-cyan-700 px-6 py-2 rounded text-white transition-colors"
            >
              Clear Filter
            </button>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-gray-400 text-3xl">🌤️</span>
            </div>
            <h3 className="text-2xl text-gray-400 font-semibold mb-4">Welcome to Weather Monitor</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Add ICAO weather station codes to start monitoring aviation weather conditions with customizable minima thresholds.
            </p>
            <div className="bg-gray-800 rounded-lg p-4 max-w-sm mx-auto">
              <h4 className="text-cyan-400 font-semibold mb-2">Example Stations:</h4>
              <div className="text-sm text-gray-300 space-y-1">
                <div>🇺🇸 KJFK - New York JFK</div>
                <div>🇬🇧 EGLL - London Heathrow</div>
                <div>🇨🇦 CYYT - St. John's</div>
                <div>🇩🇪 EDDF - Frankfurt</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
      />

      <NotamModal
        isOpen={notamModal.isOpen}
        onClose={handleCloseNotams}
        icao={notamModal.icao}
      />
    </div>
  );
};

export default WeatherMonitorApp;-400 font-semibold">
              📊 Total NOTAMs: {notamData.length}
            </span>
          </div>
          {notamData.map((notam, index) => (
            <div key={index} className="bg-gray-900 rounded-lg border border-gray-600 p-4">
              <div className="flex justify-between items-start mb-3">
                <span className="text-orange-400 font-bold text-lg">
                  {notam.number || `NOTAM ${index + 1}`}
                </span>
                {notam.type && (
                  <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs font-bold">
                    {notam.type}
                  </span>
                )}
              </div>
              {(notam.summary || notam.description) && (
                <div className="bg-gray-800 p-3 rounded border-l-4 border-orange-500 mb-3">
                  <p className="text-gray-100 text-sm leading-relaxed">
                    {notam.summary || notam.description}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {notam.validFrom && (
                  <div>
                    <span className="text-green-400 font-medium">From: </span>
                    <span className="text-gray-200">{new Date(notam.validFrom).toLocaleString()}</span>
                  </div>
                )}
                {notam.validTo && (
                  <div>
                    <span className="text-red-400 font-medium">Until: </span>
                    <span className="text-gray-200">{new Date(notam.validTo).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-gray-400 text-2xl">📋</span>
          </div>
          <h3 className="text-xl text-gray-400 font-semibold mb-2">No NOTAMs Found</h3>
          <p className="text-gray-500">No active NOTAMs for {icao}</p>
        </div>
      )}
    </MobileOptimizedModal>
  );
};

const WeatherTile = ({ 
  icao, 
  minima, 
  isGlobalMinima,
  onUpdateMinima, 
  onResetMinima,
  onRemove,
  globalMinimized,
  onToggleMinimize,
  settings,
  onShowNotams,
  onDragStart,
  onDragEnd,
  onReorder,
  draggedItem
}) => {
  const [metarData, setMetarData] = useState("");
  const [tafData, setTafData] = useState("");
  const [loading, setLoading] = useState(true);
  const [individualMinimized, setIndividualMinimized] = useLocalStorage(`weatherTileMin_${icao}`, false);
  
  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [isLongPressed, setIsLongPressed] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const dragRef = useRef(null);
  const longPressTimer = useRef(null);
  const isMobile = useMediaQuery(`(max-width: ${CONFIG.MOBILE_BREAKPOINT}px)`);

  const effectiveMinimized = globalMinimized || individualMinimized;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [metar, taf] = await Promise.all([
        fetchWeatherData('metar', icao),
        fetchWeatherData('taf', icao)
      ]);
      setMetarData(metar);
      setTafData(taf);
    } catch (error) {
      console.error(`Error fetching weather for ${icao}:`, error);
    } finally {
      setLoading(false);
    }
  }, [icao]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, CONFIG.REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Drag handlers
  const handleDragStart = useCallback((e, isTouch = false) => {
    if (!isLongPressed && isTouch) return;
    if (e.target.closest('input') || e.target.closest('button')) return;

    e.preventDefault();
    
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    const rect = dragRef.current.getBoundingClientRect();
    
    const offset = {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
    
    setDragOffset(offset);
    setDragPosition({ x: clientX - offset.x, y: clientY - offset.y });
    setIsDragging(true);
    onDragStart(icao);
  }, [isLongPressed, icao, onDragStart]);

  const handleDragMove = useCallback((e, isTouch = false) => {
    if (!isDragging) return;
    
    e.preventDefault();
    
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    setDragPosition({
      x: clientX - dragOffset.x,
      y: clientY - dragOffset.y
    });

    const elementBelow = document.elementFromPoint(clientX, clientY);
    const tileBelow = elementBelow?.closest('[data-icao]');
    
    if (tileBelow && tileBelow.dataset.icao !== icao) {
      const rect = tileBelow.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const insertAfter = clientX > centerX || clientY > centerY;
      
      onReorder(icao, tileBelow.dataset.icao, insertAfter);
    }
  }, [isDragging, dragOffset, icao, onReorder]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    setIsLongPressed(false);
    setDragPosition({ x: 0, y: 0 });
    onDragEnd();
  }, [isDragging, onDragEnd]);

  // Touch handlers
  const handleTouchStart = useCallback((e) => {
    if (e.target.closest('input') || e.target.closest('button')) return;
    
    longPressTimer.current = setTimeout(() => {
      setIsLongPressed(true);
      if (navigator.vibrate) navigator.vibrate(50);
    }, CONFIG.LONG_PRESS_DURATION);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    if (!isDragging) {
      setIsLongPressed(false);
    } else {
      handleDragEnd();
    }
  }, [isDragging, handleDragEnd]);

  const handleTouchMove = useCallback((e) => {
    if (isLongPressed) {
      if (!isDragging) {
        handleDragStart(e, true);
      } else {
        handleDragMove(e, true);
      }
    }
  }, [isLongPressed, isDragging, handleDragStart, handleDragMove]);

  // Global event listeners for drag
  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e) => handleDragMove(e, false);
      const handleMouseUp = () => handleDragEnd();
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd, handleTouchMove, handleTouchEnd]);

  // Determine colors and border
  const scheme = COLOR_SCHEMES[settings.colorScheme] || COLOR_SCHEMES.classic;
  const metarConditions = parseWeatherConditions(metarData);
  const metarMeetsMinima = checkMeetsMinima(metarConditions, minima);
  const tafHtml = formatTAFWithColors(tafData, minima, settings.colorScheme, settings.tafFilterEnabled);
  
  const getBorderColor = () => {
    if (loading || !settings.borderColoringEnabled) return 'border-gray-600';
    
    const hasBelow = tafHtml.includes(scheme.below.split(' ')[0].replace('text-', ''));
    const metarBelow = settings.metarFilterEnabled && !metarMeetsMinima;
    
    if (hasBelow || metarBelow) {
      return scheme.below.split(' ')[1] || 'border-red-500';
    }
    return scheme.above.split(' ')[1] || 'border-green-500';
  };

  const getMetarColor = () => {
    if (!settings.metarFilterEnabled) return scheme.base.split(' ')[0];
    return metarMeetsMinima ? scheme.above.split(' ')[0] : scheme.below.split(' ')[0];
  };

  const dragStyle = isDragging ? {
    position: 'fixed',
    left: dragPosition.x,
    top: dragPosition.y,
    zIndex: 1000,
    transform: 'rotate(8deg) scale(1.1)',
    opacity: 0.95,
    pointerEvents: 'none',
    filter: 'drop-shadow(0 25px 50px rgba(6, 182, 212, 0.4))'
  } : {};

  const baseStyle = isDragging ? { 
    opacity: 0.2,
    transform: 'scale(0.95)'
  } : {};

  return (
    <>
      {/* Main tile */}
      <div 
        ref={dragRef}
        data-icao={icao}
        className={`
          relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border-2 select-none
          transition-all duration-300 backdrop-blur-sm
          ${isDragging ? '' : 'hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/10'} 
          ${getBorderColor()}
          ${isLongPressed && !isDragging ? 'animate-pulse scale-[1.02] shadow-lg shadow-cyan-500/20' : ''}
          ${draggedItem === icao && !isDragging ? 'opacity-50 scale-95' : ''}
        `}
        style={baseStyle}
        onMouseDown={(e) => handleDragStart(e, false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="absolute left-2 top-2 cursor-grab active:cursor-grabbing opacity-50 hover:opacity-100 transition-opacity">
          <svg width="12" height="16" viewBox="0 0 12 16" className="text-gray-500 hover:text-cyan-400">
            <circle cx="2" cy="4" r="1.5" fill="currentColor" />
            <circle cx="2" cy="8" r="1.5" fill="currentColor" />
            <circle cx="2" cy="12" r="1.5" fill="currentColor" />
            <circle cx="6" cy="4" r="1.5" fill="currentColor" />
            <circle cx="6" cy="8" r="1.5" fill="currentColor" />
            <circle cx="6" cy="12" r="1.5" fill="currentColor" />
            <circle cx="10" cy="4" r="1.5" fill="currentColor" />
            <circle cx="10" cy="8" r="1.5" fill="currentColor" />
            <circle cx="10" cy="12" r="1.5" fill="currentColor" />
          </svg>
        </div>

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 z-20 w-8 h-8 bg-gray-900/80 hover:bg-red-600 rounded-full flex items-center justify-center text-red-400 hover:text-white transition-all duration-200 backdrop-blur-sm"
          title="Remove"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 20 20">
            <path d="M5.5 14.5l9-9m-9 0l9 9" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Minimize button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!globalMinimized) setIndividualMinimized(!individualMinimized);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          disabled={globalMinimized}
          className={`absolute left-12 top-2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-sm ${
            globalMinimized 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50' 
              : 'bg-gray-900/80 hover:bg-gray-600 text-gray-300 hover:text-white'
          }`}
          title={globalMinimized ? 'Global minimize active' : (effectiveMinimized ? 'Expand' : 'Collapse')}
        >
          <svg className={`w-4 h-4 transition-transform duration-300 ${effectiveMinimized ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 9l-6 6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Title */}
        <div className="text-center mt-6 mb-4">
          <h3 className="text-2xl font-bold bg-gradient-to-br from-cyan-400 to-cyan-600 bg-clip-text text-transparent tracking-wider">
            {icao}
          </h3>
        </div>

        {/* Minima Controls */}
        <div className="grid grid-cols-2 gap-3 mb-4" onClick={(e) => e.stopPropagation()}>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Ceiling (ft)</label>
            <input
              type="number"
              value={minima.ceiling}
              onChange={(e) => onUpdateMinima('ceiling', parseFloat(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="w-full bg-gray-700 rounded px-3 py-2 text-white text-center focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              min="0"
              step="100"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Visibility (SM)</label>
            <input
              type="number"
              value={minima.visibility}
              onChange={(e) => onUpdateMinima('visibility', parseFloat(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="w-full bg-gray-700 rounded px-3 py-2 text-white text-center focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              min="0"
              step="0.1"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mb-4" onClick={(e) => e.stopPropagation()}>
          {isGlobalMinima ? (
            <span className="text-xs text-gray-400 italic">Using default minima</span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResetMinima();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="text-xs text-yellow-400 hover:text-yellow-300 underline"
            >
              Reset to default
            </button>
          )}
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowNotams();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 text-gray-300 hover:text-white px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 border border-gray-600 hover:border-gray-500"
          >
            📋 NOTAMs
          </button>
        </div>

        {/* Weather Data */}
        {effectiveMinimized ? (
          <div className="text-center">
            <span className="text-xs text-gray-400 bg-gray-900 px-2 py-1 rounded">
              Weather minimized
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-4 border-t-cyan-500 border-gray-600 rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-gray-400">Loading...</p>
              </div>
            ) : (
              <>
                {metarData && (
                  <div>
                    <div className="text-xs font-semibold text-cyan-400 mb-1">METAR:</div>
                    <div className={`bg-gray-900 p-3 rounded text-xs font-mono ${getMetarColor()}`}>
                      {metarData}
                    </div>
                  </div>
                )}
                
                {tafData && (
                  <div>
                    <div className="text-xs font-semibold text-cyan-400 mb-1">TAF:</div>
                    <div 
                      className="bg-gray-900 p-3 rounded text-xs font-mono leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: tafHtml }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Dragging clone */}
      {isDragging && (
        <div 
          className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-2xl p-4 border-2 border-cyan-400 backdrop-blur-md pointer-events-none"
          style={dragStyle}
        >
          <div className="text-center">
            <h3 className="text-2xl font-bold bg-gradient-to-br from-cyan-400 to-cyan-600 bg-clip-text text-transparent tracking-wider">
              {icao}
            </h3>
            <div className="mt-2 text-cyan-400 text-sm font-medium animate-pulse flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
              Dragging...
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const ControlPanel = ({ 
  onAddIcao, 
  globalMinima, 
  onUpdateGlobalMinima,
  onApplyGlobalMinima,
  globalMinimized,
  onToggleGlobalMinimized,
  onOpenSettings,
  settings,
  icaoFilter,
  setIcaoFilter,
  showFilteredOnly,
  setShowFilteredOnly,
  totalStations,
  filteredCount
}) => {
  const [icaoInput, setIcaoInput] = useState("");
  const [globalCeiling, setGlobalCeiling] = useState(globalMinima.ceiling);
  const [globalVis, setGlobalVis] = useState(globalMinima.visibility || globalMinima.vis);
  const isMobile = useMediaQuery(`(max-width: ${CONFIG.MOBILE_BREAKPOINT}px)`);

  useEffect(() => {
    setGlobalCeiling(globalMinima.ceiling);
    setGlobalVis(globalMinima.visibility || globalMinima.vis);
  }, [globalMinima]);

  const handleAddIcao = () => {
    if (!icaoInput.trim()) return;
    
    const icaos = icaoInput
      .toUpperCase()
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(s => s.length === 4 && /^[A-Z0-9]{4}$/.test(s));
    
    if (icaos.length > 0) {
      onAddIcao(icaos);
      setIcaoInput("");
    }
  };

  const handleApplyGlobal = () => {
    const newMinima = {
      ceiling: parseFloat(globalCeiling),
      visibility: parseFloat(globalVis)
    };
    onUpdateGlobalMinima(newMinima);
    onApplyGlobalMinima();
  };

  return (
    <div className="bg-gray-800 rounded-xl p-4 mb-6 space-y-4">
      {/* Global Minima */}
      <div className="flex flex-wrap gap-3 items-center justify-center">
        <span className="text-cyan-300 font-semibold">Global Minima:</span>
        <div className="flex gap-2 items-center">
          <label className="text-gray-300 text-sm">
            Ceiling:
            <input
              type="number"
              value={globalCeiling}
              onChange={(e) => setGlobalCeiling(e.target.value)}
              className="bg-gray-700 rounded px-2 py-1 w-20 text-center ml-1 text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              min="0"
              step="100"
            />
          </label>
          <label className="text-gray-300 text-sm">
            Visibility:
            <input
              type="number"
              value={globalVis}
              onChange={(e) => setGlobalVis(e.target.value)}
              className="bg-gray-700 rounded px-2 py-1 w-20 text-center ml-1 text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              min="0"
              step="0.1"
            />
          </label>
          <button
            onClick={handleApplyGlobal}
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white text-sm font-medium transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* ICAO Input */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-center">
        <input
          type="text"
          value={icaoInput}
          onChange={(e) => setIcaoInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddIcao()}
          placeholder="Add ICAOs (e.g. CYYT,EGLL,KJFK)"
          className={`bg-gray-700 rounded px-4 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none ${
            isMobile ? 'w-full' : 'w-80'
          }`}
        />
        <div className="flex gap-2">
          <button
            onClick={handleAddIcao}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white font-medium transition-colors"
          >
            Add Station{icaoInput.includes(',') ? 's' : ''}
          </button>
          <button
            onClick={onToggleGlobalMinimized}
            className={`px-4 py-2 rounded text-white font-medium transition-colors ${
              globalMinimized ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'
            }`}
          >
            {globalMinimized ? 'Expand All' : 'Minimize All'}
          </button>
          <button
            onClick={onOpenSettings}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-white font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {isMobile ? '' : 'Settings'}
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-center">
        <div className="flex items-center gap-2">
          <span className="text-gray-300 text-sm">🔍 Filter:</span>
          <input
            type="text"
            value={icaoFilter}
            onChange={(e) => setIcaoFilter(e.target.value)}
            placeholder="Filter stations..."
            className={`bg-gray-700 rounded px-3 py-1.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-sm ${
              isMobile ? 'w-full' : 'w-48'
            }`}
          />
          <button
            onClick={() => setShowFilteredOnly(!showFilteredOnly)}
            className={`px-3 py-1.5 rounded text-white text-sm font-medium transition-colors ${
              showFilteredOnly ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-gray-600 hover:bg-gray-700'
            }`}
          >
            {showFilteredOnly ? 'Active' : 'Apply'}
          </button>
          {(icaoFilter || showFilteredOnly) && (
            <button
              onClick={() => {
                setIcaoFilter("");
                setShowFilteredOnly(false);
              }}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white text-sm transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        
        <div className="text-sm text-gray-400">
          Showing {filteredCount} of {totalStations} stations
        </div>
      </div>

      {/* Status Indicators */}
      <div className="flex flex-wrap justify-center gap-2 text-xs">
        <span className={`px-2 py-1 rounded ${settings.tafFilterEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
          TAF: {settings.tafFilterEnabled ? 'ON' : 'OFF'}
        </span>
        <span className={`px-2 py-1 rounded ${settings.metarFilterEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
          METAR: {settings.metarFilterEnabled ? 'ON' : 'OFF'}
        </span>
        <span className={`px-2 py-1 rounded ${settings.borderColoringEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
          Borders: {settings.borderColoringEnabled ? 'ON' : 'OFF'}
        </span>
        <span className="px-2 py-1 bg-purple-600 text-white rounded">
          {COLOR_SCHEMES[settings.colorScheme]?.name || 'Custom'}
        </span>
      </div>
    </div>
  );
};
        <span className="text-cyan-300 font-semibold">Global Minima:</span>
        <div className="flex gap-2 items-center">
          <label className="text-gray-300 text-sm">
            Ceiling:
            <input
              type="number"
              value={globalCeiling}
              onChange={(e) => setGlobalCeiling(e.target.value)}
              className="bg-gray-700 rounded px-2 py-1 w-20 text-center ml-1 text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              min="0"
              step="100"
            />
          </label>
          <label className="text-gray-300 text-sm">
            Visibility:
            <input
              type="number"
              value={globalVis}
              onChange={(e) => setGlobalVis(e.target.value)}
              className="bg-gray-700 rounded px-2 py-1 w-20 text-center ml-1 text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              min="0"
              step="0.1"
            />
          </label>
          <button
            onClick={handleApplyGlobal}
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white text-sm font-medium transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* ICAO Input */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-center">
        <input
          type="text"
          value={icaoInput}
          onChange={(e) => setIcaoInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddIcao()}
          placeholder="Add ICAOs (e.g. CYYT,EGLL,KJFK)"
          className={`bg-gray-700 rounded px-4 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none ${
            isMobile ? 'w-full' : 'w-80'
          }`}
        />
        <div className="flex gap-2">
          <button
            onClick={handleAddIcao}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white font-medium transition-colors"
          >
            Add Station{icaoInput.includes(',') ? 's' : ''}
          </button>
          <button
            onClick={onToggleGlobalMinimized}
            className={`px-4 py-2 rounded text-white font-medium transition-colors ${
              globalMinimized ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'
            }`}
          >
            {globalMinimized ? 'Expand All' : 'Minimize All'}
          </button>
          <button
            onClick={onOpenSettings}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-white font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {isMobile ? '' : 'Settings'}
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-center">
        <div className="flex items-center gap-2">
          <span className="text-gray-300 text-sm">🔍 Filter:</span>
          <input
            type="text"
            value={icaoFilter}
            onChange={(e) => setIcaoFilter(e.target.value)}
            placeholder="Filter stations..."
            className={`bg-gray-700 rounded px-3 py-1.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-sm ${
              isMobile ? 'w-full' : 'w-48'
            }`}
          />
          <button
            onClick={() => setShowFilteredOnly(!showFilteredOnly)}
            className={`px-3 py-1.5 rounded text-white text-sm font-medium transition-colors ${
              showFilteredOnly ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-gray-600 hover:bg-gray-700'
            }`}
          >
            {showFilteredOnly ? 'Active' : 'Apply'}
          </button>
          {(icaoFilter || showFilteredOnly) && (
            <button
              onClick={() => {
                setIcaoFilter("");
                setShowFilteredOnly(false);
              }}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white text-sm transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        
        <div className="text-sm text-gray-400">
          Showing {filteredCount} of {totalStations} stations
        </div>
      </div>

      {/* Status Indicators */}
      <div className="flex flex-wrap justify-center gap-2 text-xs">
        <span className={`px-2 py-1 rounded ${settings.tafFilterEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
          TAF: {settings.tafFilterEnabled ? 'ON' : 'OFF'}
        </span>
        <span className={`px-2 py-1 rounded ${settings.metarFilterEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
          METAR: {settings.metarFilterEnabled ? 'ON' : 'OFF'}
        </span>
        <span className={`px-2 py-1 rounded ${settings.borderColoringEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
          Borders: {settings.borderColoringEnabled ? 'ON' : 'OFF'}
        </span>
        <span className="px-2 py-1 bg-purple-600 text-white rounded">
          {COLOR_SCHEMES[settings.colorScheme]?.name || 'Custom'}
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const WeatherMonitorApp = () => {
  // Core state
  const [icaos, setIcaos] = useLocalStorage('weatherICAOs', []);
  const [globalMinima, setGlobalMinima] = useLocalStorage('globalWeatherMinima', { ceiling: 500, visibility: 1 });
  const [customMinima, setCustomMinima] = useLocalStorage('weatherMinima', {});
  const [globalMinimized, setGlobalMinimized] = useLocalStorage('globalWeatherMinimized', false);
  
  // Settings state
  const [settings, setSettings] = useLocalStorage('displaySettings', {
    tafFilterEnabled: true,
    metarFilterEnabled: false,
    borderColoringEnabled: true,
    colorScheme: 'classic',
    customColors: {
      above: 'text-green-400',
      below: 'text-red-400',
      base: 'text-green-400'
    }
  });

  // UI state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notamModal, setNotamModal] = useState({ isOpen: false, icao: null });
  const [icaoFilter, setIcaoFilter] = useState("");
  const [showFilteredOnly, setShowFilteredOnly] = useState(false);
  
  // Drag state
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragInsertPosition, setDragInsertPosition] = useState(null);

  const isMobile = useMediaQuery(`(max-width: ${CONFIG.MOBILE_BREAKPOINT}px)`);

  // Filtered ICAOs
  const filteredIcaos = useMemo(() => {
    if (!showFilteredOnly || !icaoFilter.trim()) {
      return icaos;
    }

    const filters = icaoFilter.toUpperCase().split(/[,\s]+/).filter(s => s.length > 0);
    return icaos.filter(icao => 
      filters.some(filter => icao.includes(filter) || filter.includes(icao))
    );
  }, [icaos, icaoFilter, showFilteredOnly]);

  // Handlers
  const handleAddIcao = useCallback((newIcaos) => {
    setIcaos(prev => {
      const existing = new Set(prev);
      const toAdd = newIcaos.filter(icao => !existing.has(icao));
      return [...prev, ...toAdd];
    });
  }, [setIcaos]);

  const handleRemoveIcao = useCallback((icao) => {
    setIcaos(prev => prev.filter(i => i !== icao));
    setCustomMinima(prev => {
      const newMinima = { ...prev };
      delete newMinima[icao];
      return newMinima;
    });
  }, [setIcaos, setCustomMinima]);

  const handleUpdateMinima = useCallback((icao, field, value) => {
    setCustomMinima(prev => ({
      ...prev,
      [icao]: {
        ...(prev[icao] || globalMinima),
        [field]: value
      }
    }));
  }, [setCustomMinima, globalMinima]);

  const handleResetMinima = useCallback((icao) => {
    setCustomMinima(prev => {
      const newMinima = { ...prev };
      delete newMinima[icao];
      return newMinima;
    });
  }, [setCustomMinima]);

  const handleApplyGlobalMinima = useCallback(() => {
    setCustomMinima({});
  }, [setCustomMinima]);

  const handleShowNotams = useCallback((icao) => {
    setNotamModal({ isOpen: true, icao });
  }, []);

  const handleCloseNotams = useCallback(() => {
    setNotamModal({ isOpen: false, icao: null });
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((icao) => {
    setDraggedItem(icao);
    setDragInsertPosition(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragInsertPosition(null);
  }, []);

  const handleReorder = useCallback((draggedIcao, targetIcao, insertAfter = false) => {
    if (draggedIcao === targetIcao) return;
    
    const newInsertPosition = { targetIcao, insertAfter };
    
    if (!dragInsertPosition || 
        dragInsertPosition.targetIcao !== newInsertPosition.targetIcao || 
        dragInsertPosition.insertAfter !== newInsertPosition.insertAfter) {
      setDragInsertPosition(newInsertPosition);
      
      setIcaos(prev => {
        const newOrder = prev.filter(icao => icao !== draggedIcao);
        const targetIndex = newOrder.indexOf(targetIcao);
        
        if (targetIndex === -1) return prev;
        
        const insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
        newOrder.splice(insertIndex, 0, draggedIcao);
        
        return newOrder;
      });
    }
  }, [dragInsertPosition, setIcaos]);

  const shouldShowInsertionSpace = useCallback((icao, position) => {
    if (!dragInsertPosition || !draggedItem || icao === draggedItem) return false;
    
    if (position === 'before') {
      return dragInsertPosition.targetIcao === icao && !dragInsertPosition.insertAfter;
    } else if (position === 'after') {
      return dragInsertPosition.targetIcao === icao && dragInsertPosition.insertAfter;
    }
    
    return false;
  }, [dragInsertPosition, draggedItem]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ControlPanel
          onAddIcao={handleAddIcao}
          globalMinima={globalMinima}
          onUpdateGlobalMinima={setGlobalMinima}
          onApplyGlobalMinima={handleApplyGlobalMinima}
          globalMinimized={globalMinimized}
          onToggleGlobalMinimized={setGlobalMinimized}
          onOpenSettings={() => setSettingsOpen(true)}
          settings={settings}
          icaoFilter={icaoFilter}
          setIcaoFilter={setIcaoFilter}
          showFilteredOnly={showFilteredOnly}
          setShowFilteredOnly={setShowFilteredOnly}
          totalStations={icaos.length}
          filteredCount={filteredIcaos.length}
        />

        {/* Weather Tiles Grid */}
        {filteredIcaos.length > 0 ? (
          <div className={`grid gap-4 pb-8 ${
            isMobile 
              ? 'grid-cols-1' 
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
          }`}>
            {filteredIcaos.map((icao) => {
              const minima = customMinima[icao] || globalMinima;
              const isGlobalMinima = !customMinima[icao];
              
              return (
                <div key={`${icao}-container`} className="relative transition-all duration-300 ease-out">
                  {shouldShowInsertionSpace(icao, 'before') && (
                    <div className="absolute -left-4 top-0 bottom-0 w-2 bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400 rounded-full shadow-lg shadow-cyan-400/50 animate-pulse" />
                  )}
                  
                  {draggedItem && icao !== draggedItem && (
                    <div className="absolute inset-0 rounded-xl border-2 border-dashed border-cyan-400/30 bg-cyan-400/5 opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
                  )}
                  
                  <WeatherTile
                    icao={icao}
                    minima={minima}
                    isGlobalMinima={isGlobalMinima}
                    onUpdateMinima={(field, value) => handleUpdateMinima(icao, field, value)}
                    onResetMinima={() => handleResetMinima(icao)}
                    onRemove={() => handleRemoveIcao(icao)}
                    globalMinimized={globalMinimized}
                    onToggleMinimize={() => {}}
                    settings={settings}
                    onShowNotams={() => handleShowNotams(icao)}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onReorder={handleReorder}
                    draggedItem={draggedItem}
                  />
                  
                  {shouldShowInsertionSpace(icao, 'after') && (
                    <div className="absolute -right-4 top-0 bottom-0 w-2 bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400 rounded-full shadow-lg shadow-cyan-400/50 animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>
        ) : icaos.length > 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-gray-400 text-2xl">🔍</span>
            </div>
            <h3 className="text-xl text-gray-400 font-semibold mb-2">No Matching Stations</h3>
            <p className="text-gray-500 mb-4">Filter "{icaoFilter}" matches 0 of {icaos.length} stations</p>
            <button
              onClick={() => {
                setIcaoFilter("");
                setShowFilteredOnly(false);
              }}
              className="bg-cyan-600 hover:bg-cyan-700 px-6 py-2 rounded text-white transition-colors"
            >
              Clear Filter
            </button>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-gray-400 text-3xl">🌤️</span>
            </div>
            <h3 className="text-2xl text-gray-400 font-semibold mb-4">Welcome to Weather Monitor</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Add ICAO weather station codes to start monitoring aviation weather conditions with customizable minima thresholds.
            </p>
            <div className="bg-gray-800 rounded-lg p-4 max-w-sm mx-auto">
              <h4 className="text-cyan-400 font-semibold mb-2">Example Stations:</h4>
              <div className="text-sm text-gray-300 space-y-1">
                <div>🇺🇸 KJFK - New York JFK</div>
                <div>🇬🇧 EGLL - London Heathrow</div>
                <div>🇨🇦 CYYT - St. John's</div>
                <div>🇩🇪 EDDF - Frankfurt</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
      />

      <NotamModal
        isOpen={notamModal.isOpen}
        onClose={handleCloseNotams}
        icao={notamModal.icao}
      />
    </div>
  );
};

export default WeatherMonitorApp;
