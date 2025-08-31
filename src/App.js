// Complete App.js with draggable weather cards, keyword highlighting, and mobile optimization
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import KeywordHighlightManager, { highlightKeywords } from './KeywordHighlight';
import NotamModal from './NotamModal';

// Weather utilities
const TAF_CACHE_MS = 600000; // 10 minutes
const METAR_CACHE_MS = 60000; // 1 minute

const weatherCache = {};
const corsProxy = "https://corsproxy.io/?";

// Default keyword categories
const DEFAULT_KEYWORDS = {
  warnings: {
    name: 'Warnings',
    color: 'bg-red-500',
    textColor: 'text-white',
    keywords: ['TSGR', 'TSRA', 'SQ', 'FC', 'DS', 'SS', 'FZRA', 'FZDZ', 'BLSN', 'DRSN', '+SN', '+RA', '+TSRA', 'SH', 'TCU', 'CB'],
    enabled: true
  },
  visibility: {
    name: 'Visibility',
    color: 'bg-orange-500',
    textColor: 'text-white',
    keywords: ['BR', 'FG', 'FU', 'VA', 'DU', 'SA', 'HZ', 'PY', '1/4SM', '1/2SM', '3/4SM', '1SM', '2SM'],
    enabled: true
  },
  wind: {
    name: 'Wind',
    color: 'bg-blue-500',
    textColor: 'text-white',
    keywords: ['G', 'VRB', 'KT', 'MPS', '35KT', '40KT', '45KT', '50KT'],
    enabled: true
  },
  clouds: {
    name: 'Clouds',
    color: 'bg-purple-500',
    textColor: 'text-white',
    keywords: ['FEW', 'SCT', 'BKN', 'OVC', 'VV', 'CLR', 'SKC', 'NSC', '000', '001', '002', '003', '004', '005'],
    enabled: true
  },
  temperature: {
    name: 'Temperature',
    color: 'bg-green-500',
    textColor: 'text-white',
    keywords: ['M10', 'M15', 'M20', 'M25', 'M30', '35/', '40/', '45/'],
    enabled: true
  }
};

// Color presets for customization
const COLOR_PRESETS = {
  'classic': {
    name: 'Classic Green/Red',
    aboveMinima: 'text-green-300',
    belowMinima: 'text-red-400',
    metar: 'text-green-300',
    taf: 'text-green-300'
  },
  'aviation': {
    name: 'Aviation Blue/Amber',
    aboveMinima: 'text-blue-300',
    belowMinima: 'text-yellow-400',
    metar: 'text-blue-300',
    taf: 'text-blue-300'
  },
  'modern': {
    name: 'Modern Cyan/Orange',
    aboveMinima: 'text-cyan-300',
    belowMinima: 'text-orange-400',
    metar: 'text-cyan-300',
    taf: 'text-cyan-300'
  },
  'highContrast': {
    name: 'High Contrast',
    aboveMinima: 'text-white',
    belowMinima: 'text-red-500',
    metar: 'text-white',
    taf: 'text-white'
  },
  'custom': {
    name: 'Custom Colors',
    aboveMinima: 'text-green-400',
    belowMinima: 'text-red-400',
    metar: 'text-green-400',
    taf: 'text-green-400'
  }
};

// Utility functions
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

// Enhanced TAF highlighting with keyword support
function highlightTAFWithOptions(raw, minC, minV, filterEnabled, colorScheme, keywordCategories = {}, keywordEnabled = false) {
  const colors = COLOR_PRESETS[colorScheme] || COLOR_PRESETS.classic;
  
  return raw.split("\n").map(line => {
    const p = parseLine(line);
    const visOk = p.isGreater ? true : (p.visMiles >= minV);
    const ceilOk = p.ceiling >= minC;
    const meetsMinima = visOk && ceilOk;
    
    // Apply keyword highlighting first if enabled
    let processedLine = keywordEnabled ? highlightKeywords(line, keywordCategories) : line;
    
    // If filter is disabled, use base color for all text
    if (!filterEnabled) {
      return `<div class="${colors.taf}">${processedLine}</div>`;
    }
    
    // If filter is enabled, apply color coding based on minima
    const colorClass = meetsMinima ? colors.aboveMinima : colors.belowMinima;
    const fontWeight = meetsMinima ? '' : 'font-bold';
    
    return `<div class="${colorClass} ${fontWeight}">${processedLine}</div>`;
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
// Color Picker Component
const ColorPicker = ({ label, value, onChange, className = "" }) => {
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
    <div className={`flex flex-col gap-2 ${className}`}>
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

// Settings Panel Component
const SettingsPanel = ({ 
  isOpen, 
  onClose, 
  minimaFilterEnabled, 
  setMinimaFilterEnabled, 
  colorScheme, 
  setColorScheme,
  customColors,
  setCustomColors,
  borderColoringEnabled,
  setBorderColoringEnabled,
  metarFilterEnabled,
  setMetarFilterEnabled
}) => {
  const modalRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    // Only drag from the header
    if (!e.target.classList.contains('modal-header-fixed') && !e.target.closest('.modal-header-fixed')) {
      return;
    }
    setIsDragging(true);
    const modalRect = modalRef.current.getBoundingClientRect();
    setOffset({
      x: e.clientX - modalRect.left,
      y: e.clientY - modalRect.top,
    });
    // Prevent text selection while dragging
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
      });
    }
  }, [isDragging, offset]);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Center modal on first open
      if (modalRef.current) {
        const { innerWidth, innerHeight } = window;
        const { offsetWidth, offsetHeight } = modalRef.current;
        setPosition({ x: (innerWidth - offsetWidth) / 2, y: (innerHeight - offsetHeight) / 2 });
      }
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay modal-animate" style={{ alignItems: 'flex-start', justifyContent: 'flex-start', pointerEvents: isDragging ? 'auto' : 'none' }}>
      <div 
        ref={modalRef} 
        className="modal-content-fixed bg-gray-800 rounded-xl shadow-2xl border border-gray-600 max-w-2xl"
        style={{ 
          transform: `translate(${position.x}px, ${position.y}px)`, 
          pointerEvents: 'auto' 
        }}
      >
        <div 
          className="modal-header-fixed flex justify-between items-center border-b border-gray-700 p-6 bg-gray-900 rounded-t-xl cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          <h3 className="text-xl font-bold text-cyan-400">Display Settings</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-4xl font-light focus:outline-none hover:bg-gray-700 rounded-full w-12 h-12 flex items-center justify-center transition-all duration-200"
          >
            ×
          </button>
        </div>
        
        <div className="modal-body-scrollable p-6 space-y-6">
          {/* Minima Filter Toggle */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-lg font-semibold text-cyan-300 mb-3">Weather Minima Filters</h4>
            
            {/* TAF Filter */}
            <div className="flex items-center gap-3 mb-4">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={minimaFilterEnabled}
                  onChange={(e) => setMinimaFilterEnabled(e.target.checked)}
                  className="sr-only"
                />
                <div className={`relative w-14 h-8 rounded-full transition-colors duration-200 ${
                  minimaFilterEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}>
                  <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-200 ${
                    minimaFilterEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </div>
                <span className="ml-3 text-gray-300">
                  {minimaFilterEnabled ? 'ON' : 'OFF'} - Color code TAF text based on minima
                </span>
              </label>
            </div>

            {/* METAR Filter */}
            <div className="flex items-center gap-3 mb-4">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={metarFilterEnabled}
                  onChange={(e) => setMetarFilterEnabled(e.target.checked)}
                  className="sr-only"
                />
                <div className={`relative w-14 h-8 rounded-full transition-colors duration-200 ${
                  metarFilterEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}>
                  <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-200 ${
                    metarFilterEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </div>
                <span className="ml-3 text-gray-300">
                  {metarFilterEnabled ? 'ON' : 'OFF'} - Color code METAR text based on minima
                </span>
              </label>
            </div>
            
            {/* Border Coloring Toggle */}
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={borderColoringEnabled}
                  onChange={(e) => setBorderColoringEnabled(e.target.checked)}
                  className="sr-only"
                />
                <div className={`relative w-14 h-8 rounded-full transition-colors duration-200 ${
                  borderColoringEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}>
                  <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-200 ${
                    borderColoringEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </div>
                <span className="ml-3 text-gray-300">
                  {borderColoringEnabled ? 'ON' : 'OFF'} - Color code tile borders based on minima
                </span>
              </label>
            </div>
          </div>

          {/* Color Scheme Selection */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-lg font-semibold text-cyan-300 mb-3">Color Schemes</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => setColorScheme(key)}
                  className={`p-3 rounded-lg border-2 text-left transition-all duration-200 ${
                    colorScheme === key 
                      ? 'border-cyan-400 bg-gray-800' 
                      : 'border-gray-600 bg-gray-800 hover:border-gray-500'
                  }`}
                >
                  <div className="font-medium text-gray-200 mb-1">{preset.name}</div>
                  <div className="flex gap-2 text-xs">
                    <span className={`${preset.aboveMinima} bg-gray-700 px-2 py-1 rounded`}>
                      Above Minima
                    </span>
                    <span className={`${preset.belowMinima} bg-gray-700 px-2 py-1 rounded font-bold`}>
                      Below Minima
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Colors (only show if custom scheme is selected) */}
          {colorScheme === 'custom' && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-cyan-300 mb-4">Custom Color Configuration</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorPicker
                  label="Above Minima Color"
                  value={customColors.aboveMinima}
                  onChange={(color) => setCustomColors(prev => ({ ...prev, aboveMinima: color }))}
                />
                <ColorPicker
                  label="Below Minima Color"
                  value={customColors.belowMinima}
                  onChange={(color) => setCustomColors(prev => ({ ...prev, belowMinima: color }))}
                />
                <ColorPicker
                  label="METAR Text Color"
                  value={customColors.metar}
                  onChange={(color) => setCustomColors(prev => ({ ...prev, metar: color }))}
                />
                <ColorPicker
                  label="TAF Text Color"
                  value={customColors.taf}
                  onChange={(color) => setCustomColors(prev => ({ ...prev, taf: color }))}
                />
              </div>
              
              {/* Preview */}
              <div className="mt-4 p-3 bg-black rounded border border-gray-700">
                <div className="text-sm text-gray-400 mb-2">Preview:</div>
                <div className={`${customColors.metar} font-mono text-sm mb-1`}>
                  METAR KJFK 012351Z 26008KT 10SM FEW250 10/M06 A3012
                </div>
                <div className={`${customColors.aboveMinima} font-mono text-sm mb-1`}>
                  TAF Line Above Minima: 1000 OVC 6SM -SN
                </div>
                <div className={`${customColors.belowMinima} font-mono text-sm font-bold`}>
                  TAF Line Below Minima: 200 OVC 1/2SM +SN
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer-fixed border-t border-gray-700 p-4 bg-gray-900 text-center rounded-b-xl">
          <button
            onClick={onClose}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Apply Settings
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')
  );
};

// Weather Tile Component with enhanced mobile support and keyword highlighting
const WeatherTile = ({ 
  icao, 
  weatherMinima, 
  globalWeatherMinima, 
  setWeatherMinima, 
  resetWeatherMinima, 
  removeWeatherICAO,
  globalMinimized = false,
  onDragStart,
  onDragEnd,
  draggedItem,
  onReorder,
  minimaFilterEnabled,
  colorScheme,
  customColors,
  borderColoringEnabled,
  metarFilterEnabled,
  keywordCategories,
  keywordHighlightEnabled
}) => {
  const [metarRaw, setMetarRaw] = useState("");
  const [tafHtml, setTafHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [notamModalOpen, setNotamModalOpen] = useState(false);
  const [notamData, setNotamData] = useState([]);
  const [notamLoading, setNotamLoading] = useState(false);
  const [notamError, setNotamError] = useState(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const longPressTimer = useRef(null);
  const [isLongPressed, setIsLongPressed] = useState(false);

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

  // Get current color scheme
  const getCurrentColors = () => {
    if (colorScheme === 'custom') {
      return customColors;
    }
    return COLOR_PRESETS[colorScheme] || COLOR_PRESETS.classic;
  };

  // Weather data fetching with keyword highlighting support
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [taf, metar] = await Promise.all([
        fetchTAF(icao), 
        fetchMETAR(icao)
      ]);
      
      setMetarRaw(metar);
      
      if (taf) {
        const html = highlightTAFWithOptions(
          taf, 
          min.ceiling, 
          min.vis, 
          minimaFilterEnabled, 
          colorScheme === 'custom' ? 'custom' : colorScheme,
          keywordCategories,
          keywordHighlightEnabled
        );
        setTafHtml(html);
      }
      
      setLoading(false);
    };
    
    fetchData();
    const intervalId = setInterval(fetchData, 300000);
    return () => clearInterval(intervalId);
  }, [icao, min.ceiling, min.vis, minimaFilterEnabled, colorScheme, metarFilterEnabled, keywordCategories, keywordHighlightEnabled, customColors]);

  // Function to get METAR color class based on conditions
  const getMETARColorClass = () => {
    if (!metarFilterEnabled) {
      return getCurrentColors().metar; // Use base METAR color when filter is off
    }
    
    // Parse METAR to check if it meets minima
    const p = parseLine(metarRaw);
    const visOk = p.isGreater ? true : (p.visMiles >= min.vis);
    const ceilOk = p.ceiling >= min.ceiling;
    const meetsMinima = visOk && ceilOk;
    
    const currentColors = getCurrentColors();
    return meetsMinima ? currentColors.aboveMinima : currentColors.belowMinima;
  };

  // Function to get processed METAR text with keyword highlighting
  const getProcessedMETARText = () => {
    if (keywordHighlightEnabled) {
      return highlightKeywords(metarRaw, keywordCategories);
    }
    return metarRaw;
  };

  // Update custom colors in COLOR_PRESETS when customColors change
  useEffect(() => {
    if (colorScheme === 'custom') {
      COLOR_PRESETS.custom = { ...COLOR_PRESETS.custom, ...customColors };
    }
  }, [customColors, colorScheme]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, minimized ? '1' : '0');
    } catch (e) {}
  }, [minimized, storageKey]);

  // Drag event handlers
  const handleDragStart = useCallback((e, isTouch = false) => {
    if (!isLongPressed && isTouch) return;

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
  }, [isLongPressed, onDragStart, icao]);

  const handleDragMove = useCallback((e, isTouch = false) => {
    if (!isDragging) return;
    
    e.preventDefault();
    
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    setDragPosition({
      x: clientX - dragOffset.x,
      y: clientY - dragOffset.y
    });

    // Find the element we're hovering over
    const elementBelow = document.elementFromPoint(clientX, clientY);
    const tileBelow = elementBelow?.closest('[data-icao]');
    
    if (tileBelow && tileBelow.dataset.icao !== icao) {
      // Calculate if we should insert before or after the target
      const rect = tileBelow.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // For grid layout, consider both X and Y positions
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

  // Long press handling for touch devices
  const handleTouchStart = (e) => {
    // Don't start long press on interactive elements
    if (e.target.tagName === 'INPUT' || 
        e.target.tagName === 'BUTTON' || 
        e.target.closest('input') || 
        e.target.closest('button')) {
      return;
    }
    
    longPressTimer.current = setTimeout(() => {
      setIsLongPressed(true);
      // Add haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500); // 500ms long press
  };

  const handleTouchEnd = useCallback((e) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    if (!isDragging) {
      setIsLongPressed(false);
    } else {
      handleDragEnd();
    }
  }, [isDragging, handleDragEnd]);

  // Mouse event handlers
  const handleMouseDown = (e) => {
    // Don't start drag if clicking on interactive elements
    if (e.target.tagName === 'INPUT' || 
        e.target.tagName === 'BUTTON' || 
        e.target.closest('input') || 
        e.target.closest('button')) {
      return;
    }
    handleDragStart(e, false);
  };

  const handleMouseMove = useCallback((e) => {
    handleDragMove(e, false);
  }, [handleDragMove]);

  const handleMouseUp = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Touch event handlers
  const handleTouchMove = useCallback((e) => {
    if (isLongPressed) {
      if (!isDragging) {
        const touch = e.touches[0];
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        if (elementBelow && (
          elementBelow.tagName === 'INPUT' || 
          elementBelow.tagName === 'BUTTON' || 
          elementBelow.closest('input') || 
          elementBelow.closest('button')
        )) {
          return;
        }
        handleDragStart(e, true);
      } else {
        handleDragMove(e, true);
      }
    }
  }, [isLongPressed, isDragging, handleDragStart, handleDragMove]);

  // Add global event listeners
  useEffect(() => {
    if (isDragging) {
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
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const toggleMinimize = () => setMinimized(prev => !prev);

  // NOTAM handling
  const fetchNotamData = async () => {
    setNotamLoading(true);
    setNotamError(null);
    
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
      
      const parsedNotams = [];
      
      if (Array.isArray(data)) {
        data.forEach(item => {
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
            isPermanent: item.validTo ? item.validTo.includes('PERM') : false,
            body: item.body || item.summary || ''
          });
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

  const handleNotamClick = (e) => {
    if (isDragging || isLongPressed) return;
    
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
      e.preventDefault();
    }
    setNotamModalOpen(true);
    setTimeout(() => {
      fetchNotamData();
    }, 0);
  };

  const handleCloseNotamModal = () => {
    setNotamModalOpen(false);
    setNotamData([]);
    setNotamError(null);
  };

  const getBorderClass = () => {
    if (loading) return "border-gray-700";
    if (!borderColoringEnabled) return "border-gray-600";
    
    const currentColors = getCurrentColors();
    
    const hasBelowMinimaConditions = tafHtml && tafHtml.includes(currentColors.belowMinima.replace('text-', '')) && minimaFilterEnabled;
    
    let metarBelowMinima = false;
    if (metarFilterEnabled && metarRaw) {
      const p = parseLine(metarRaw);
      const visOk = p.isGreater ? true : (p.visMiles >= min.vis);
      const ceilOk = p.ceiling >= min.ceiling;
      metarBelowMinima = !(visOk && ceilOk);
    }
    
    if (hasBelowMinimaConditions || metarBelowMinima) {
      switch (currentColors.belowMinima) {
        case 'text-red-400':
        case 'text-red-500':
          return "border-red-500";
        case 'text-orange-400':
          return "border-orange-500";
        case 'text-yellow-400':
          return "border-yellow-500";
        case 'text-blue-400':
          return "border-blue-500";
        case 'text-cyan-400':
          return "border-cyan-500";
        case 'text-purple-400':
          return "border-purple-500";
        case 'text-pink-400':
          return "border-pink-500";
        case 'text-white':
          return "border-gray-300";
        case 'text-gray-300':
          return "border-gray-400";
        default:
          return "border-red-500";
      }
    }
    
    switch (currentColors.aboveMinima) {
      case 'text-green-400':
      case 'text-green-300':
        return "border-green-500";
      case 'text-blue-300':
      case 'text-blue-400':
        return "border-blue-500";
      case 'text-cyan-300':
      case 'text-cyan-400':
        return "border-cyan-500";
      case 'text-white':
        return "border-gray-300";
      case 'text-gray-300':
        return "border-gray-400";
      default:
        return "border-green-500";
    }
  };
  // WeatherTile JSX continues...
  const dragStyle = isDragging ? {
    position: 'fixed',
    left: dragPosition.x,
    top: dragPosition.y,
    zIndex: 1000,
    transform: 'rotate(8deg) scale(1.1)',
    transition: 'none',
    pointerEvents: 'none',
    opacity: 0.95,
    filter: 'drop-shadow(0 25px 50px rgba(6, 182, 212, 0.4))',
    animation: 'dragFloat 2s ease-in-out infinite'
  } : {};

  const baseStyle = isDragging ? { 
    opacity: 0.2,
    transform: 'scale(0.95)',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
  } : {};

  return (
    <>
      {/* Original tile */}
      <div 
        ref={dragRef}
        data-icao={icao}
        className={`relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-lg p-4 border-2 select-none
          ${isDragging ? '' : 'hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/10'} 
          ${getBorderClass()}
          ${isLongPressed && !isDragging ? 'animate-[wiggle_0.5s_ease-in-out_infinite] scale-[1.02] shadow-lg shadow-cyan-500/20' : ''}
          ${draggedItem === icao && !isDragging ? 'opacity-50 scale-95' : ''}
          transition-all duration-300 ease-out backdrop-blur-sm`}
        style={{ 
          ...baseStyle,
          ...(effectiveMinimized ? { paddingTop: 8, paddingBottom: 8 } : undefined)
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-live="polite"
      >
        {/* Remove button */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            removeWeatherICAO(icao);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          type="button" 
          className="absolute top-2 right-2 z-20 bg-gradient-to-br from-gray-900 to-gray-800 border-none rounded-full w-8 h-8 flex items-center justify-center text-red-400 hover:bg-gradient-to-br hover:from-red-600 hover:to-red-700 hover:text-white hover:scale-110 transition-all duration-200 shadow-lg hover:shadow-red-500/25 backdrop-blur-sm"
          title={`Remove ${icao}`}
          aria-label={`Remove ${icao}`}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 20 20" className="transition-transform duration-200 hover:rotate-90">
            <path d="M5.5 14.5l9-9m-9 0l9 9" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Minimize toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!globalMinimized) toggleMinimize();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          type="button"
          title={globalMinimized ? `Global minimize active` : (minimized ? `Expand ${icao} weather` : `Collapse ${icao} weather`)}
          aria-pressed={effectiveMinimized}
          disabled={globalMinimized}
          className={`absolute left-2 top-2 ${globalMinimized ? 'bg-gradient-to-br from-gray-600 to-gray-700' : 'bg-gradient-to-br from-gray-800 to-gray-900'} text-gray-200 rounded-full w-8 h-8 flex items-center justify-center shadow-lg border-2 border-gray-600 hover:scale-105 transition-all duration-200 backdrop-blur-sm`}
          style={{ zIndex: 12, opacity: globalMinimized ? 0.7 : 1, cursor: globalMinimized ? 'not-allowed' : 'pointer' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform duration-300 ${effectiveMinimized ? 'rotate-180' : ''}`}>
            <path d="M18 9l-6 6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Title with drag handle */}
        <div className="flex items-center justify-center gap-2 relative">
          <div className="absolute left-0 top-0 bottom-0 flex items-center cursor-grab active:cursor-grabbing" title="Drag to reorder">
            <svg width="12" height="16" viewBox="0 0 12 16" className="text-gray-500 hover:text-cyan-400 transition-colors">
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
          <div className="text-2xl font-bold text-center bg-gradient-to-br from-cyan-400 to-cyan-600 bg-clip-text text-transparent tracking-wider drop-shadow-sm">{icao}</div>
        </div>

        {/* Minima controls */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center mt-2 text-xs" onClick={(e) => e.stopPropagation()}>
          <label className={`${usingDefault ? 'opacity-70 italic' : ''} text-gray-300 flex items-center gap-1`}>
            Ceil: 
            <input 
              type="number" 
              value={min.ceiling}
              className="bg-gray-700 p-1 rounded w-16 sm:w-20 text-center text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none text-xs"
              onChange={(e) => setWeatherMinima(icao, 'ceiling', e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label={`${icao} ceiling minima`}
            />
          </label>
          <label className={`${usingDefault ? 'opacity-70 italic' : ''} text-gray-300 flex items-center gap-1`}>
            Vis: 
            <input 
              type="number" 
              step="0.1" 
              value={min.vis}
              className="bg-gray-700 p-1 rounded w-16 sm:w-20 text-center text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none text-xs"
              onChange={(e) => setWeatherMinima(icao, 'vis', e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label={`${icao} visibility minima`}
            />
          </label>
          {usingDefault ? 
            <span className="opacity-70 italic text-gray-400 text-xs">(default)</span> : 
            <button 
              className="text-yellow-400 underline text-xs hover:text-yellow-200 whitespace-nowrap" 
              onClick={(e) => {
                e.stopPropagation();
                resetWeatherMinima(icao);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label={`Reset ${icao} minima`}
            >
              reset
            </button>
          }
        </div>

        {/* NOTAM Button */}
        <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNotamClick(e);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border border-gray-600 hover:border-gray-500 shadow-sm hover:shadow-md hover:scale-105 backdrop-blur-sm"
            title={`View NOTAMs for ${icao}`}
          >
            <span className="flex items-center gap-1">
              📋 NOTAMs
            </span>
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
                <div 
                  className={`mt-1 bg-gray-900 p-2 rounded font-mono ${getMETARColorClass()}`}
                  dangerouslySetInnerHTML={{ __html: getProcessedMETARText() }}
                />
              </div>
            )}
            
            {tafHtml && (
              <div className="mt-2 text-xs">
                <strong className="text-cyan-400">TAF:</strong>
                <div className="mt-1 bg-gray-900 p-2 rounded font-mono" dangerouslySetInnerHTML={{ __html: tafHtml }}></div>
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

      {/* Dragging clone */}
      {isDragging && (
        <div 
          className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-2xl p-4 border-2 border-cyan-400 backdrop-blur-md"
          style={dragStyle}
        >
          <div className="text-2xl font-bold text-center bg-gradient-to-br from-cyan-400 to-cyan-600 bg-clip-text text-transparent tracking-wider drop-shadow-sm">{icao}</div>
          <div className="mt-2 text-center text-cyan-400 text-sm font-medium animate-pulse flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
            Dragging...
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
      )}
    </>
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

  // Settings state
  const [minimaFilterEnabled, setMinimaFilterEnabled] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("minimaFilterEnabled") || "true");
    } catch (e) {
      return true;
    }
  });

  const [metarFilterEnabled, setMetarFilterEnabled] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("metarFilterEnabled") || "false");
    } catch (e) {
      return false;
    }
  });

  const [borderColoringEnabled, setBorderColoringEnabled] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("borderColoringEnabled") || "true");
    } catch (e) {
      return true;
    }
  });

  const [colorScheme, setColorScheme] = useState(() => {
    try {
      return localStorage.getItem("colorScheme") || "classic";
    } catch (e) {
      return "classic";
    }
  });

  const [customColors, setCustomColors] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("customColors") || JSON.stringify({
        aboveMinima: 'text-green-400',
        belowMinima: 'text-red-400',
        metar: 'text-green-400',
        taf: 'text-green-400'
      }));
    } catch (e) {
      return {
        aboveMinima: 'text-green-400',
        belowMinima: 'text-red-400',
        metar: 'text-green-400',
        taf: 'text-green-400'
      };
    }
  });

  // Keyword highlighting state
  const [keywordHighlightEnabled, setKeywordHighlightEnabled] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("keywordHighlightEnabled") || "false");
    } catch (e) {
      return false;
    }
  });

  const [keywordCategories, setKeywordCategories] = useState(() => {
    try {
      const saved = localStorage.getItem("keywordCategories");
      return saved ? JSON.parse(saved) : DEFAULT_KEYWORDS;
    } catch (e) {
      return DEFAULT_KEYWORDS;
    }
  });

  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [keywordHighlightModalOpen, setKeywordHighlightModalOpen] = useState(false);

  // ICAO Filter state
  const [icaoFilter, setIcaoFilter] = useState("");
  const [showFilteredOnly, setShowFilteredOnly] = useState(false);

  // Drag state
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragInsertPosition, setDragInsertPosition] = useState(null);
  
  const icaoInputRef = useRef(null);
  const filterInputRef = useRef(null);

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
    } catch (e) {}
  }, [globalWeatherMinimized]);

  useEffect(() => {
    try {
      localStorage.setItem("minimaFilterEnabled", JSON.stringify(minimaFilterEnabled));
    } catch (e) {}
  }, [minimaFilterEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("metarFilterEnabled", JSON.stringify(metarFilterEnabled));
    } catch (e) {}
  }, [metarFilterEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("borderColoringEnabled", JSON.stringify(borderColoringEnabled));
    } catch (e) {}
  }, [borderColoringEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("colorScheme", colorScheme);
    } catch (e) {}
  }, [colorScheme]);

  useEffect(() => {
    try {
      localStorage.setItem("customColors", JSON.stringify(customColors));
    } catch (e) {}
  }, [customColors]);

  useEffect(() => {
    try {
      localStorage.setItem("keywordHighlightEnabled", JSON.stringify(keywordHighlightEnabled));
    } catch (e) {}
  }, [keywordHighlightEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("keywordCategories", JSON.stringify(keywordCategories));
    } catch (e) {}
  }, [keywordCategories]);

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
      .split(/[,\s]+/)
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

  // Filter functions
  const getFilteredICAOs = () => {
    if (!showFilteredOnly || !icaoFilter.trim()) {
      return weatherICAOs;
    }

    const filterICAOs = icaoFilter
      .toUpperCase()
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (filterICAOs.length === 0) {
      return weatherICAOs;
    }

    return weatherICAOs.filter(icao => 
      filterICAOs.some(filterIcao => 
        icao.includes(filterIcao) || filterIcao.includes(icao)
      )
    );
  };

  const handleToggleFilter = () => {
    setShowFilteredOnly(prev => !prev);
    if (!showFilteredOnly) {
      setTimeout(() => filterInputRef.current?.focus(), 100);
    }
  };

  const handleClearFilter = () => {
    setIcaoFilter("");
    setShowFilteredOnly(false);
  };

  const filteredICAOs = getFilteredICAOs();

  // Drag and drop handlers
  const handleDragStart = (icao) => {
    setDraggedItem(icao);
    setDragInsertPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragInsertPosition(null);
  };

  const handleReorder = (draggedIcao, targetIcao, insertAfter = false) => {
    if (draggedIcao === targetIcao) return;
    
    const newInsertPosition = { targetIcao, insertAfter };
    
    if (!dragInsertPosition || 
        dragInsertPosition.targetIcao !== newInsertPosition.targetIcao || 
        dragInsertPosition.insertAfter !== newInsertPosition.insertAfter) {
      setDragInsertPosition(newInsertPosition);
      
      setWeatherICAOs(prev => {
        const newOrder = prev.filter(icao => icao !== draggedIcao);
        const targetIndex = newOrder.indexOf(targetIcao);
        
        if (targetIndex === -1) return prev;
        
        const insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
        newOrder.splice(insertIndex, 0, draggedIcao);
        
        return newOrder;
      });
    }
  };

  const shouldShowInsertionSpace = (icao, position) => {
    if (!dragInsertPosition || !draggedItem || icao === draggedItem) return false;
    
    if (position === 'before') {
      return dragInsertPosition.targetIcao === icao && !dragInsertPosition.insertAfter;
    } else if (position === 'after') {
      return dragInsertPosition.targetIcao === icao && dragInsertPosition.insertAfter;
    }
    
    return false;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <Header />
      
      {/* Global Weather Minima Controls */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 mb-4">
        <div className="flex flex-wrap gap-2 sm:gap-4 justify-center items-center mb-2 bg-gray-800 rounded-lg p-4">
          <span className="font-bold text-cyan-300 text-sm sm:text-base">Weather Minima:</span>
          <label className="text-gray-300 text-sm flex flex-col sm:flex-row items-center gap-1">
            Ceil (ft):
            <input 
              type="number" 
              className="bg-gray-700 p-2 rounded w-20 text-center text-white text-sm"
              value={globalWeatherCeiling}
              onChange={(e) => setGlobalWeatherCeiling(e.target.value)}
            />
          </label>
          <label className="text-gray-300 text-sm flex flex-col sm:flex-row items-center gap-1">
            Vis (SM):
            <input 
              type="number" 
              step="0.1" 
              className="bg-gray-700 p-2 rounded w-20 text-center text-white text-sm"
              value={globalWeatherVis}
              onChange={(e) => setGlobalWeatherVis(e.target.value)}
            />
          </label>
          <button 
            onClick={handleApplyGlobalWeatherMinima} 
            className="bg-green-600 px-4 py-2 rounded text-white hover:bg-green-700 transition-colors text-sm"
          >
            Set Default
          </button>
          
          {/* Settings Button */}
          <button
            onClick={() => setSettingsPanelOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-white transition-colors flex items-center gap-2 text-sm"
            title="Display Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"></path>
            </svg>
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Keywords Button */}
          <button
            onClick={() => setKeywordHighlightModalOpen(true)}
            className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded text-white transition-colors flex items-center gap-2 text-sm"
            title="Keyword Highlighting"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="M21 21l-4.35-4.35"></path>
            </svg>
            <span className="hidden sm:inline">Keywords</span>
          </button>
        </div>

        {/* Interactive status indicators */}
        <div className="flex flex-wrap justify-center gap-2 text-xs bg-gray-800 rounded-lg p-3 mb-2">
          <button 
            onClick={() => setMinimaFilterEnabled(prev => !prev)}
            className="flex items-center gap-1.5 p-1 rounded-full hover:bg-gray-700 transition-colors"
            title="Toggle TAF color coding"
          >
            <span className="text-gray-400 font-medium pl-2">TAF Filter:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              minimaFilterEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}>
              {minimaFilterEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
          <button 
            onClick={() => setMetarFilterEnabled(prev => !prev)}
            className="flex items-center gap-1.5 p-1 rounded-full hover:bg-gray-700 transition-colors"
            title="Toggle METAR color coding"
          >
            <span className="text-gray-400 font-medium pl-2">METAR Filter:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              metarFilterEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}>
              {metarFilterEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
          <button 
            onClick={() => setKeywordHighlightEnabled(prev => !prev)}
            className="flex items-center gap-1.5 p-1 rounded-full hover:bg-gray-700 transition-colors"
            title="Toggle keyword highlighting"
          >
            <span className="text-gray-400 font-medium pl-2">Keywords:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              keywordHighlightEnabled ? 'bg-yellow-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}>
              {keywordHighlightEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
          <button 
            onClick={() => setBorderColoringEnabled(prev => !prev)}
            className="flex items-center gap-1.5 p-1 rounded-full hover:bg-gray-700 transition-colors"
            title="Toggle tile border coloring"
          >
            <span className="text-gray-400 font-medium pl-2">Borders:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              borderColoringEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}>
              {borderColoringEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
          <div className="flex items-center gap-1.5 p-1">
            <span className="text-gray-400 font-medium pl-2">Colors:</span>
            <span className="px-2.5 py-0.5 bg-gray-700 text-gray-300 rounded-full text-xs">
              {COLOR_PRESETS[colorScheme]?.name || 'Custom'}
            </span>
          </div>
        </div>
      </div>
      
      {/* ICAO Input and Controls */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 mb-6">
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 mb-4 items-center bg-gray-800 rounded-lg p-4">
          <input 
            ref={icaoInputRef}
            placeholder="Enter ICAOs (e.g. CYYT,EGLL,KJFK)" 
            className="bg-gray-700 p-2 rounded text-center w-full sm:w-72 text-white placeholder-gray-400 text-sm"
            onKeyPress={handleIcaoInputKeyPress}
          />
          <div className="flex gap-2 flex-wrap">
            <button 
              onClick={handleAddWeatherICAO} 
              className="bg-blue-600 px-4 py-2 rounded text-white hover:bg-blue-700 transition-colors text-sm"
            >
              Add ICAO(s)
            </button>

            <button
              onClick={toggleGlobalWeatherMinimize}
              className={`px-4 py-2 rounded text-white transition-colors text-sm ${globalWeatherMinimized ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-gray-600 hover:bg-gray-500'}`}
              title={globalWeatherMinimized ? 'Expand all weather tiles' : 'Minimize all weather tiles'}
            >
              {globalWeatherMinimized ? 'Expand All' : 'Minimize Weather'}
            </button>
          </div>
        </div>

        {/* ICAO Filter Controls */}
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 items-center bg-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-cyan-300 font-semibold text-sm">
              🔍 Filter: 
            </span>
            <input 
              ref={filterInputRef}
              value={icaoFilter}
              onChange={(e) => setIcaoFilter(e.target.value)}
              placeholder="Filter ICAOs (e.g. CY, JFK, EGLL)" 
              className="bg-gray-800 p-2 rounded text-center w-full sm:w-64 text-white placeholder-gray-400 border border-gray-600 focus:border-cyan-400 focus:outline-none transition-colors text-sm"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button 
              onClick={handleToggleFilter} 
              className={`px-4 py-2 rounded text-white transition-colors font-medium text-sm ${showFilteredOnly ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-gray-600 hover:bg-gray-500'}`}
              title={showFilteredOnly ? 'Show all stations' : 'Apply filter'}
            >
              {showFilteredOnly ? 'Filter Active' : 'Apply Filter'}
            </button>
            {(icaoFilter || showFilteredOnly) && (
              <button 
                onClick={handleClearFilter} 
                className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-white transition-colors text-sm"
                title="Clear filter and show all"
              >
                Clear
              </button>
            )}
          </div>
          <div className="text-sm text-gray-400 text-center sm:text-left">
            Showing {filteredICAOs.length} of {weatherICAOs.length} stations
          </div>
        </div>
      </div>
      
      {/* Weather Tiles Grid */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
          {filteredICAOs.map((icao, index) => (
            <div key={`${icao}-container`} className="relative transition-all duration-300 ease-out">
              {shouldShowInsertionSpace(icao, 'before') && (
                <div className="absolute -left-4 top-0 bottom-0 w-2 bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400 rounded-full shadow-lg shadow-cyan-400/50 animate-[pulse_1s_ease-in-out_infinite] before:content-[''] before:absolute before:inset-0 before:bg-cyan-400 before:rounded-full before:animate-ping before:opacity-30" />
              )}
              
              {draggedItem && icao !== draggedItem && (
                <div className="absolute inset-0 rounded-xl border-2 border-dashed border-cyan-400/30 bg-cyan-400/5 opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
              )}
              
              <WeatherTile 
                icao={icao}
                weatherMinima={weatherMinima}
                globalWeatherMinima={globalWeatherMinima}
                setWeatherMinima={handleSetWeatherMinima}
                resetWeatherMinima={handleResetWeatherMinima}
                removeWeatherICAO={handleRemoveWeatherICAO}
                globalMinimized={globalWeatherMinimized}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onReorder={handleReorder}
                draggedItem={draggedItem}
                minimaFilterEnabled={minimaFilterEnabled}
                colorScheme={colorScheme}
                customColors={customColors}
                borderColoringEnabled={borderColoringEnabled}
                metarFilterEnabled={metarFilterEnabled}
                keywordCategories={keywordCategories}
                keywordHighlightEnabled={keywordHighlightEnabled}
              />
              
              {shouldShowInsertionSpace(icao, 'after') && (
                <div className="absolute -right-4 top-0 bottom-0 w-2 bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400 rounded-full shadow-lg shadow-cyan-400/50 animate-[pulse_1s_ease-in-out_infinite] before:content-[''] before:absolute before:inset-0 before:bg-cyan-400 before:rounded-full before:animate-ping before:opacity-30" />
              )}
            </div>
          ))}
        </div>
        
        {/* Empty states */}
        {filteredICAOs.length === 0 && weatherICAOs.length > 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-4">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
              </svg>
              No stations match your filter
            </div>
            <p className="text-gray-500 mb-4">
              Filter: "<span className="text-cyan-400">{icaoFilter}</span>" matches 0 of {weatherICAOs.length} stations
            </p>
            <button 
              onClick={handleClearFilter}
              className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded text-white transition-colors"
            >
              Clear Filter
            </button>
          </div>
        ) : filteredICAOs.length === 0 && (
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
            <p className="text-gray-400 mt-2 text-sm">
              Use the Settings and Keywords buttons to configure color coding and highlighting
            </p>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        minimaFilterEnabled={minimaFilterEnabled}
        setMinimaFilterEnabled={setMinimaFilterEnabled}
        colorScheme={colorScheme}
        setColorScheme={setColorScheme}
        customColors={customColors}
        setCustomColors={setCustomColors}
        borderColoringEnabled={borderColoringEnabled}
        setBorderColoringEnabled={setBorderColoringEnabled}
        metarFilterEnabled={metarFilterEnabled}
        setMetarFilterEnabled={setMetarFilterEnabled}
      />

      {/* Keyword Highlight Manager Modal */}
      <KeywordHighlightManager
        isOpen={keywordHighlightModalOpen}
        onClose={() => setKeywordHighlightModalOpen(false)}
        keywordCategories={keywordCategories}
        setKeywordCategories={setKeywordCategories}
        keywordHighlightEnabled={keywordHighlightEnabled}
        setKeywordHighlightEnabled={setKeywordHighlightEnabled}
        defaultKeywords={DEFAULT_KEYWORDS}
      />
    </div>
  );
};

export default WeatherMonitorApp;
