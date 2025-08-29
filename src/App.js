// Complete App.js with draggable weather cards like iPhone icons
// Enhanced with Minima Filter Toggle, Color Customization, and ICAO Filter
// Updated with interactive toggle buttons instead of settings panel for main controls
// FIXED: Modal state tracking to prevent drag interference with text selection
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import './index.css';

// Weather utilities
const TAF_CACHE_MS = 600000; // 10 minutes
const METAR_CACHE_MS = 60000; // 1 minute

const weatherCache = {};
const corsProxy = "https://corsproxy.io/?";

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

// Enhanced TAF highlighting function with color customization and filter toggle
function highlightTAFWithOptions(raw, minC, minV, filterEnabled, colorScheme) {
  const colors = COLOR_PRESETS[colorScheme] || COLOR_PRESETS.classic;
  
  return raw.split("\n").map(line => {
    const p = parseLine(line);
    const visOk = p.isGreater ? true : (p.visMiles >= minV);
    const ceilOk = p.ceiling >= minC;
    const meetsMinima = visOk && ceilOk;
    
    // If filter is disabled, use base color for all text
    if (!filterEnabled) {
      return `<div class="${colors.taf}">${line}</div>`;
    }
    
    // If filter is enabled, apply color coding based on minima
    const colorClass = meetsMinima ? colors.aboveMinima : colors.belowMinima;
    const fontWeight = meetsMinima ? '' : 'font-bold';
    
    return `<div class="${colorClass} ${fontWeight}">${line}</div>`;
  }).join("");
}

// NOTAM parsing utilities (unchanged)
const parseNotamText = (notamText) => {
  if (!notamText) return null;
  
  const lines = notamText.split('\n').map(line => line.trim()).filter(line => line);
  if (lines.length === 0) return null;
  
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
  
  lines.forEach(line => {
    const upperLine = line.toUpperCase();
    
    if (!notamObj.id && line.match(/^\w+\s+NOTAM/i)) {
      const idMatch = line.match(/^(\w+)/);
      if (idMatch) notamObj.id = idMatch[1];
    }
    
    if (upperLine.startsWith('Q)')) {
      notamObj.qLine = line;
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
    
    else if (upperLine.startsWith('A)')) {
      notamObj.aLine = line.substring(2).trim();
    }
    
    else if (upperLine.startsWith('B)')) {
      notamObj.bLine = line.substring(2).trim();
      notamObj.validFrom = parseNotamDateTime(notamObj.bLine);
    }
    
    else if (upperLine.startsWith('C)')) {
      notamObj.cLine = line.substring(2).trim();
      notamObj.validTo = parseNotamDateTime(notamObj.cLine);
      notamObj.isPermanent = notamObj.cLine.includes('PERM');
    }
    
    else if (upperLine.startsWith('D)')) {
      notamObj.dLine = line.substring(2).trim();
      notamObj.schedule = notamObj.dLine;
    }
    
    else if (upperLine.startsWith('E)')) {
      notamObj.eLine = line.substring(2).trim();
      notamObj.description = notamObj.eLine;
    }
    
    else if (upperLine.startsWith('F)')) {
      notamObj.fLine = line.substring(2).trim();
    }
    
    else if (upperLine.startsWith('G)')) {
      notamObj.gLine = line.substring(2).trim();
    }
  });
  
  notamObj.isTemporary = !notamObj.isPermanent && (notamObj.validTo || notamObj.schedule);
  
  return notamObj;
};

const parseNotamDateTime = (dateTimeStr) => {
  if (!dateTimeStr || dateTimeStr.includes('PERM')) return null;
  
  const match = dateTimeStr.match(/(\d{10})/);
  if (match) {
    const dt = match[1];
    const year = 2000 + parseInt(dt.substring(0, 2));
    const month = parseInt(dt.substring(2, 4)) - 1;
    const day = parseInt(dt.substring(4, 6));
    const hour = parseInt(dt.substring(6, 8));
    const minute = parseInt(dt.substring(8, 10));
    
    return new Date(year, month, day, hour, minute);
  }
  
  return null;
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

// Settings Panel Component - Simplified to only handle color schemes
const SettingsPanel = ({ 
  isOpen, 
  onClose, 
  colorScheme, 
  setColorScheme,
  customColors,
  setCustomColors
}) => {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };
    
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      document.body.classList.add('modal-open');
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.body.classList.remove('modal-open');
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay modal-backdrop-blur modal-animate">
      <div ref={modalRef} className="modal-content-fixed bg-gray-800 rounded-xl shadow-2xl border border-gray-600 max-w-2xl">
        <div className="modal-header-fixed flex justify-between items-center border-b border-gray-700 p-6 bg-gray-900 rounded-t-xl">
          <h3 className="text-xl font-bold text-cyan-400">🎨 Color Scheme Settings</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-4xl font-light focus:outline-none hover:bg-gray-700 rounded-full w-12 h-12 flex items-center justify-center transition-all duration-200"
          >
            ×
          </button>
        </div>
        
        <div className="modal-body-scrollable p-6 space-y-6">
          {/* Color Scheme Selection */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-lg font-semibold text-cyan-300 mb-4">Choose Color Scheme</h4>
            <p className="text-gray-400 text-sm mb-4">
              These colors apply when minima filters are enabled. Toggle filters using the buttons in the main toolbar.
            </p>
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
            Apply Colors
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')
  );
};

// Enhanced NOTAM Modal with single copy button and simplified time format
const NotamModal = ({ icao, isOpen, onClose, notamData, loading, error, onModalStateChange }) => {
  const modalRef = useRef(null);
  const scrollPositionRef = useRef(0);

  // Notify parent component about modal state changes
  useEffect(() => {
    if (onModalStateChange) {
      onModalStateChange(isOpen);
    }
  }, [isOpen, onModalStateChange]);

  // Enhanced page position preservation and complete drag disconnection
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      // Store current scroll position
      scrollPositionRef.current = window.scrollY;
      
      // Calculate scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      
      // Add event listener
      document.addEventListener('mousedown', handleClickOutside);
      
      // Prevent body scroll and maintain position
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollPositionRef.current}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      
      // Prevent scrolling on the html element as well
      document.documentElement.style.overflow = 'hidden';
      
      // Add special class to completely disable all drag functionality
      document.body.classList.add('modal-open');
      document.body.setAttribute('data-modal-open', 'true');
      
    } else {
      // Restore all body styles
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      
      // Restore html overflow
      document.documentElement.style.overflow = '';
      
      // Remove modal classes
      document.body.classList.remove('modal-open');
      document.body.removeAttribute('data-modal-open');
      
      // Restore scroll position
      window.scrollTo(0, scrollPositionRef.current);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);
  
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Enhanced copy to clipboard function
  const copyToClipboard = async (text, notamNumber = '') => {
    try {
      await navigator.clipboard.writeText(text);
      // Visual feedback - find the button that was clicked
      const activeButton = document.activeElement;
      if (activeButton && activeButton.tagName === 'BUTTON') {
        const originalText = activeButton.textContent;
        const originalClass = activeButton.className;
        activeButton.textContent = '✓ Copied!';
        activeButton.className = originalClass.replace('bg-gray-600', 'bg-green-600').replace('bg-blue-600', 'bg-green-600');
        setTimeout(() => {
          activeButton.textContent = originalText;
          activeButton.className = originalClass;
        }, 2000);
      }
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (fallbackErr) {
        console.error('Failed to copy text:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  // Copy all NOTAMs function
  const copyAllNotams = () => {
    if (!notamData || notamData.length === 0) return;
    
    const allNotamsText = notamData.map((notam, index) => {
      const text = notam.body || notam.summary || notam.rawText || 'No text available';
      return `=== NOTAM ${index + 1}: ${notam.number || `${icao}-${index + 1}`} ===
Location: ${notam.location || icao}
Valid From: ${formatTime(notam.validFrom)}
Valid To: ${formatTime(notam.validTo)}

${text}

`;
    }).join('\n');
    
    const fullText = `NOTAMs for ${icao} - Generated: ${new Date().toLocaleString()}
Total NOTAMs: ${notamData.length}

${allNotamsText}`;
    
    copyToClipboard(fullText);
  };

  // Enhanced time format - show date and time ending with HH:MM Z
const formatTime = (dateStr) => {
  if (!dateStr) return 'Not specified';
  if (dateStr === 'PERMANENT') return 'PERMANENT';
  
  try {
    const date = new Date(dateStr);
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes} Z`;
  } catch {
    return dateStr;
  }
};
  
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay modal-backdrop-blur modal-animate">
      <div ref={modalRef} className="modal-content-fixed bg-gray-800 rounded-xl shadow-2xl border border-gray-600">
        {/* Header with Copy All button */}
        <div className="modal-header-fixed flex justify-between items-center border-b border-gray-700 p-6 bg-gray-900 rounded-t-xl">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold">📋</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-cyan-400">NOTAMs for {icao}</h3>
              <p className="text-gray-400 text-sm">Notice to Airmen - Current Active NOTAMs</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Copy All Button */}
            {notamData && notamData.length > 0 && (
              <button
                onClick={copyAllNotams}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 hover:scale-105"
                title="Copy all NOTAMs to clipboard"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                Copy All
              </button>
            )}
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white text-4xl font-light focus:outline-none hover:bg-gray-700 rounded-full w-12 h-12 flex items-center justify-center transition-all duration-200"
              title="Close NOTAMs"
            >
              ×
            </button>
          </div>
        </div>
        
        {/* Enhanced content with single copy button per NOTAM */}
        <div className="modal-body-scrollable p-6">
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block w-12 h-12 border-4 border-t-orange-500 border-gray-600 rounded-full animate-spin mb-4"></div>
              <p className="text-xl text-orange-400 font-semibold mb-2">Fetching NOTAMs...</p>
              <p className="text-gray-400">Checking FAA and NAV CANADA sources...</p>
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
          ) : notamData && notamData.length > 0 ? (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-cyan-400 font-semibold text-lg">
                    📊 Total NOTAMs Found: {notamData.length}
                  </span>
                  <span className="text-gray-400 text-sm">
                    🔗 Source: {icao.startsWith('C') ? 'FAA + NAV CANADA' : 'FAA NOTAM System'} • Updated: {new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* NOTAM Cards with single copy button */}
              {notamData.map((notam, idx) => {
                const notamText = notam.body || notam.summary || notam.rawText || 'No text available';
                
                return (
                  <div key={idx} className="bg-gray-900 rounded-lg border border-gray-600 overflow-hidden hover:border-gray-500 transition-colors">
                    {/* NOTAM Header with single copy button */}
                    <div className="bg-gray-800 px-6 py-4 border-b border-gray-600">
                      <div className="flex justify-between items-start flex-wrap gap-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-orange-400 font-bold text-xl">
                            {notam.number || `NOTAM ${idx + 1}`}
                          </span>
                          <span className="px-3 py-1 bg-purple-600 text-white text-xs rounded-full font-bold">
                            {notam.type || 'NOTAM'}
                          </span>
                          {notam.validTo === 'PERMANENT' && (
                            <span className="px-3 py-1 bg-red-600 text-white text-xs rounded-full font-bold">
                              PERMANENT
                            </span>
                          )}
                        </div>
                        
                        {/* Single Copy Button */}
                        <button
                          onClick={() => copyToClipboard(notamText, notam.number)}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 hover:scale-105"
                          title="Copy this NOTAM to clipboard"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                          </svg>
                          Copy NOTAM
                        </button>
                      </div>
                    </div>
                    
                    {/* NOTAM Content */}
                    <div className="p-6">
                      {/* Enhanced text container with perfect text selection */}
                      <div className="bg-black p-4 rounded-lg border-l-4 border-orange-500 relative group mb-4">
                        <div 
                          className="text-green-400 text-sm font-mono whitespace-pre-wrap leading-relaxed select-text cursor-text hover:bg-gray-900 transition-colors p-2 rounded border border-transparent hover:border-gray-600"
                          style={{ 
                            userSelect: 'text',
                            WebkitUserSelect: 'text',
                            MozUserSelect: 'text',
                            msUserSelect: 'text',
                            WebkitTouchCallout: 'default'
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onSelectStart={(e) => e.stopPropagation()}
                        >
                          {notamText}
                        </div>
                        
                        {/* Selection hint */}
                        <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-700 text-white text-xs px-2 py-1 rounded pointer-events-none">
                          Click and drag to select text
                        </div>
                      </div>
                      
                      {/* Enhanced time display - show date and time ending with HH:MM Z */}
{(notam.validFrom || notam.validTo) && (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {notam.validFrom && (
      <div className="bg-gray-800 p-3 rounded-lg">
        <h6 className="text-green-400 font-semibold mb-1 text-sm">🟢 Effective From</h6>
        <p className="text-gray-200 font-mono text-sm select-text">{formatTime(notam.validFrom)}</p>
      </div>
    )}
    {notam.validTo && (
      <div className="bg-gray-800 p-3 rounded-lg">
        <h6 className="text-red-400 font-semibold mb-1 text-sm">🔴 Valid Until</h6>
        <p className="text-gray-200 font-mono text-sm select-text">{formatTime(notam.validTo)}</p>
      </div>
    )}
  </div>
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
        </div>
        
        {/* Footer */}
        <div className="modal-footer-fixed border-t border-gray-700 p-4 bg-gray-900 text-center rounded-b-xl">
          <p className="text-gray-400 text-sm">
            📡 NOTAMs from {icao.startsWith('C') ? 'FAA + NAV CANADA' : 'FAA'} • 
            <span className="text-orange-400 font-semibold"> Always verify with official sources before flight</span>
          </p>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')
  );
};

// Weather Tile Component with drag functionality and new options - UPDATED with modal awareness
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
  isAnyModalOpen, // NEW: Track if any modal is open
  onNotamModalStateChange // NEW: Callback for NOTAM modal state changes
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
  
  // NEW: Better click vs drag detection
  const [hasMoved, setHasMoved] = useState(false);
  const [mouseDownPos, setMouseDownPos] = useState({ x: 0, y: 0 });
  const DRAG_THRESHOLD = 5; // pixels - minimum movement to start drag
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

  // Weather data fetching with enhanced color options
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [taf, metar] = await Promise.all([
        fetchTAF(icao), 
        fetchMETAR(icao)
      ]);
      
      setMetarRaw(metar);
      
      if (taf) {
        const html = highlightTAFWithOptions(taf, min.ceiling, min.vis, minimaFilterEnabled, colorScheme === 'custom' ? 'custom' : colorScheme);
        setTafHtml(html);
      }
      
      setLoading(false);
    };
    
    fetchData();
    const intervalId = setInterval(fetchData, 300000);
    return () => clearInterval(intervalId);
  }, [icao, min.ceiling, min.vis, minimaFilterEnabled, colorScheme, metarFilterEnabled]);

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

  // Update custom colors in COLOR_PRESETS when customColors change
  useEffect(() => {
    if (colorScheme === 'custom') {
      COLOR_PRESETS.custom = customColors;
    }
  }, [customColors, colorScheme]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, minimized ? '1' : '0');
    } catch (e) {}
  }, [minimized, storageKey]);

  // NOTAM modal state change handler
  const handleNotamModalStateChange = (isOpen) => {
    setNotamModalOpen(isOpen);
    if (onNotamModalStateChange) {
      onNotamModalStateChange(isOpen);
    }
  };

  // Drag event handlers - UPDATED to check for modal state
  const handleDragStart = (e, isTouch = false) => {
    // PREVENT DRAG IF ANY MODAL IS OPEN
    if (isAnyModalOpen) {
      console.log('Drag prevented: Modal is open');
      return;
    }

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
  };

  const handleDragMove = (e, isTouch = false) => {
    if (!isDragging || isAnyModalOpen) return; // PREVENT DRAG MOVE IF MODAL IS OPEN
    
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
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    setIsLongPressed(false);
    setDragPosition({ x: 0, y: 0 });
    onDragEnd();
  };

  // Long press handling for touch devices - UPDATED with modal check
  const handleTouchStart = (e) => {
    // PREVENT LONG PRESS IF ANY MODAL IS OPEN
    if (isAnyModalOpen) {
      return;
    }

    // Don't start long press on interactive elements
    if (e.target.tagName === 'INPUT' || 
        e.target.tagName === 'BUTTON' || 
        e.target.closest('input') || 
        e.target.closest('button')) {
      return;
    }
    
    longPressTimer.current = setTimeout(() => {
      if (!isAnyModalOpen) { // DOUBLE CHECK MODAL STATE
        setIsLongPressed(true);
        // Add haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, 500); // 500ms long press
  };

  const handleTouchEnd = (e) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    if (!isDragging) {
      setIsLongPressed(false);
    } else {
      handleDragEnd();
    }
  };

      // Mouse event handlers - FIXED with better click detection
  const handleMouseDown = (e) => {
    // COMPLETELY PREVENT MOUSE DOWN IF ANY MODAL IS OPEN OR DATA ATTRIBUTE IS SET
    if (isAnyModalOpen || document.body.getAttribute('data-modal-open')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Don't start drag if clicking on interactive elements
    if (e.target.tagName === 'INPUT' || 
        e.target.tagName === 'BUTTON' || 
        e.target.closest('input') || 
        e.target.closest('button')) {
      return;
    }
    
    // Store initial mouse position for drag threshold detection
    setMouseDownPos({ x: e.clientX, y: e.clientY });
    setHasMoved(false);
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  // Touch event handlers - UPDATED with modal check
  const handleTouchMove = (e) => {
    if (isAnyModalOpen) return; // PREVENT TOUCH MOVE IF MODAL IS OPEN

    if (isLongPressed) {
      if (!isDragging) {
        // Don't start drag if touching interactive elements
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
  };

  // Add global event listeners - UPDATED to only attach when no modal is open
  useEffect(() => {
    if (isDragging && !isAnyModalOpen) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, isLongPressed, dragOffset, isAnyModalOpen]);

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
          const notamText = item.body || item.summary || '';
          const parsed = parseNotamText(notamText);
          
          if (parsed) {
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

  const handleNotamClick = (e) => {
    if (isDragging || isLongPressed) return;
    
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
      e.preventDefault();
    }
    handleNotamModalStateChange(true);
    setTimeout(() => {
      fetchNotamData();
    }, 0);
  };

  const handleCloseNotamModal = () => {
    handleNotamModalStateChange(false);
    setNotamData([]);
    setNotamError(null);
  };

  const getBorderClass = () => {
    if (loading) return "border-gray-700";
    if (!borderColoringEnabled) return "border-gray-600"; // Neutral border when border coloring is off
    
    // Use current color scheme for borders
    const currentColors = getCurrentColors();
    
    // Check if TAF contains the current scheme's below-minima color class
    const hasBelowMinimaConditions = tafHtml && tafHtml.includes(currentColors.belowMinima.replace('text-', '')) && minimaFilterEnabled;
    
    // Also check METAR conditions for border coloring if METAR filter is enabled
    let metarBelowMinima = false;
    if (metarFilterEnabled && metarRaw) {
      const p = parseLine(metarRaw);
      const visOk = p.isGreater ? true : (p.visMiles >= min.vis);
      const ceilOk = p.ceiling >= min.ceiling;
      metarBelowMinima = !(visOk && ceilOk);
    }
    
    // Use below minima colors if either TAF or METAR (when enabled) are below minima  
    if (hasBelowMinimaConditions || metarBelowMinima) {
      // Map text colors to appropriate border colors for BELOW minima
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
          return "border-red-500"; // fallback
      }
    }
    
    // Above minima - use appropriate border color
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
        return "border-green-500"; // fallback
    }
  };

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
      {/* Original tile (with enhanced animations) */}
      <div 
        ref={dragRef}
        data-icao={icao}
        className={`relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-lg p-4 border-2 select-none
          ${isDragging ? '' : 'hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/10'} 
          ${getBorderClass()}
          ${isLongPressed && !isDragging && !isAnyModalOpen ? 'animate-[wiggle_0.5s_ease-in-out_infinite] scale-[1.02] shadow-lg shadow-cyan-500/20' : ''}
          ${draggedItem === icao && !isDragging ? 'opacity-50 scale-95' : ''}
          ${isAnyModalOpen ? 'pointer-events-auto' : ''} // ALLOW INTERACTIONS WHEN MODAL IS OPEN
          transition-all duration-300 ease-out backdrop-blur-sm`}
        style={{ 
          ...baseStyle,
          ...(effectiveMinimized ? { paddingTop: 8, paddingBottom: 8 } : undefined),
          ...(isDragging ? {} : {
            background: 'linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(17, 24, 39, 0.95) 100%)',
            backdropFilter: 'blur(10px)',
            borderColor: (() => {
              if (loading) return 'rgb(75, 85, 99)';
              if (!borderColoringEnabled) return 'rgb(75, 85, 99)';
              
              const currentColors = getCurrentColors();
              
              // Check if TAF contains the current scheme's below-minima color class
              const hasBelowMinimaConditions = tafHtml && tafHtml.includes(currentColors.belowMinima.replace('text-', '')) && minimaFilterEnabled;
              
              // Also check METAR conditions if METAR filter is enabled
              let metarBelowMinima = false;
              if (metarFilterEnabled && metarRaw) {
                const p = parseLine(metarRaw);
                const visOk = p.isGreater ? true : (p.visMiles >= min.vis);
                const ceilOk = p.ceiling >= min.ceiling;
                metarBelowMinima = !(visOk && ceilOk);
              }
              
              // Use below minima colors if either TAF or METAR (when enabled) are below minima
              if (hasBelowMinimaConditions || metarBelowMinima) {
                // Below minima colors
                switch (currentColors.belowMinima) {
                  case 'text-red-400':
                  case 'text-red-500':
                    return 'rgb(239, 68, 68)'; // red-500
                  case 'text-orange-400':
                    return 'rgb(249, 115, 22)'; // orange-500
                  case 'text-yellow-400':
                    return 'rgb(234, 179, 8)'; // yellow-500
                  case 'text-blue-400':
                    return 'rgb(59, 130, 246)'; // blue-500
                  case 'text-cyan-400':
                    return 'rgb(6, 182, 212)'; // cyan-500
                  case 'text-purple-400':
                    return 'rgb(168, 85, 247)'; // purple-500
                  case 'text-pink-400':
                    return 'rgb(236, 72, 153)'; // pink-500
                  case 'text-white':
                    return 'rgb(209, 213, 219)'; // gray-300
                  case 'text-gray-300':
                    return 'rgb(156, 163, 175)'; // gray-400
                  default:
                    return 'rgb(239, 68, 68)'; // fallback red-500
                }
              }
              
              // Above minima colors
              switch (currentColors.aboveMinima) {
                case 'text-green-400':
                case 'text-green-300':
                  return 'rgb(34, 197, 94)'; // green-500
                case 'text-blue-300':
                case 'text-blue-400':
                  return 'rgb(59, 130, 246)'; // blue-500
                case 'text-cyan-300':
                case 'text-cyan-400':
                  return 'rgb(6, 182, 212)'; // cyan-500
                case 'text-white':
                  return 'rgb(209, 213, 219)'; // gray-300
                case 'text-gray-300':
                  return 'rgb(156, 163, 175)'; // gray-400
                default:
                  return 'rgb(34, 197, 94)'; // fallback green-500
              }
            })()
          })
        }}
        onMouseDown={!isAnyModalOpen ? handleMouseDown : undefined} // CONDITIONALLY ATTACH MOUSE DOWN
        onTouchStart={!isAnyModalOpen ? handleTouchStart : undefined} // CONDITIONALLY ATTACH TOUCH START
        onTouchEnd={!isAnyModalOpen ? handleTouchEnd : undefined} // CONDITIONALLY ATTACH TOUCH END
        aria-live="polite"
      >
        {/* Enhanced Remove button with better animations - FIXED */}
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

        {/* Enhanced Minimize toggle with better styling - FIXED */}
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
          aria-label={globalMinimized ? `Global minimize active` : `${minimized ? 'Expand' : 'Collapse'} ${icao} weather`}
          disabled={globalMinimized}
          className={`absolute left-2 top-2 ${globalMinimized ? 'bg-gradient-to-br from-gray-600 to-gray-700' : 'bg-gradient-to-br from-gray-800 to-gray-900'} text-gray-200 rounded-full w-8 h-8 flex items-center justify-center shadow-lg border-2 border-gray-600 hover:scale-105 transition-all duration-200 backdrop-blur-sm hover:shadow-cyan-500/25`}
          style={{ zIndex: 12, opacity: globalMinimized ? 0.7 : 1, cursor: globalMinimized ? 'not-allowed' : 'pointer' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform duration-300 ${effectiveMinimized ? 'rotate-180' : ''}`}>
            <path d="M18 9l-6 6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Enhanced Title with gradient text and drag handle */}
        <div className="flex items-center justify-center gap-2 relative">
          {/* Drag handle - ONLY SHOW WHEN NO MODAL IS OPEN */}
          {!isAnyModalOpen && (
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
          )}
          <div className="text-2xl font-bold text-center bg-gradient-to-br from-cyan-400 to-cyan-600 bg-clip-text text-transparent tracking-wider drop-shadow-sm">{icao}</div>
        </div>

        {/* Minima controls with filter status indicator - FIXED */}
        <div className="flex gap-3 items-center mt-2 text-xs" onClick={(e) => e.stopPropagation()}>
          <label className={`${usingDefault ? 'opacity-70 italic' : ''} text-gray-300`}>
            Ceil: 
            <input 
              type="number" 
              value={min.ceiling}
              className="bg-gray-700 p-1 rounded w-20 text-center ml-1 text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              onChange={(e) => setWeatherMinima(icao, 'ceiling', e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label={`${icao} ceiling minima`}
            />
          </label>
          <label className={`${usingDefault ? 'opacity-70 italic' : ''} text-gray-300`}>
            Vis: 
            <input 
              type="number" 
              step="0.1" 
              value={min.vis}
              className="bg-gray-700 p-1 rounded w-20 text-center ml-1 text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              onChange={(e) => setWeatherMinima(icao, 'vis', e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label={`${icao} visibility minima`}
            />
          </label>
          {usingDefault ? 
            <span className="opacity-70 italic text-gray-400">(default)</span> : 
            <button 
              className="text-yellow-400 underline text-xs hover:text-yellow-200" 
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

        {/* Filter status indicator */}
        {!minimaFilterEnabled && !metarFilterEnabled && (
          <div className="mt-1 text-center">
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
              Filters: OFF
            </span>
          </div>
        )}

        {/* Enhanced NOTAM Button with modern styling - FIXED */}
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
                <div className={`mt-1 bg-gray-900 p-2 rounded font-mono ${getMETARColorClass()}`}>
                  {metarRaw}
                </div>
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
        
        {/* NOTAM Modal - UPDATED with modal state tracking */}
        <NotamModal 
          icao={icao}
          isOpen={notamModalOpen}
          onClose={handleCloseNotamModal}
          notamData={notamData}
          loading={notamLoading}
          error={notamError}
          onModalStateChange={handleNotamModalStateChange} // PASS MODAL STATE CHANGE HANDLER
        />
      </div>

      {/* Enhanced dragging clone with premium effects - ONLY SHOW WHEN NO MODAL IS OPEN */}
      {isDragging && !isAnyModalOpen && (
        <div 
          className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-2xl p-4 border-2 border-cyan-400 backdrop-blur-md"
          style={{
            ...dragStyle,
            background: 'linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(17, 24, 39, 0.95) 100%)',
          }}
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

// Main App Component with drag and drop functionality, settings, and ICAO filter
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

  // New settings state
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

  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  // ICAO Filter state
  const [icaoFilter, setIcaoFilter] = useState("");
  const [showFilteredOnly, setShowFilteredOnly] = useState(false);

  // Modal state tracking - NEW
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false);

  // Drag state with insertion position tracking
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragInsertPosition, setDragInsertPosition] = useState(null);
  
  const icaoInputRef = useRef(null);
  const filterInputRef = useRef(null);

  // Modal state change handler - NEW
  const handleNotamModalStateChange = (isOpen) => {
    setIsAnyModalOpen(isOpen);
  };

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
          
          {/* Toggle buttons */}
          <div className="flex flex-wrap items-center gap-3 ml-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">TAF:</span>
              <button
                onClick={() => setMinimaFilterEnabled(!minimaFilterEnabled)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
                  minimaFilterEnabled 
                    ? 'bg-green-600 text-white shadow-md hover:bg-green-500' 
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500 hover:text-white'
                }`}
              >
                {minimaFilterEnabled ? '✓ ON' : '✗ OFF'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-400">METAR:</span>
              <button
                onClick={() => setMetarFilterEnabled(!metarFilterEnabled)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
                  metarFilterEnabled 
                    ? 'bg-green-600 text-white shadow-md hover:bg-green-500' 
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500 hover:text-white'
                }`}
              >
                {metarFilterEnabled ? '✓ ON' : '✗ OFF'}
              </button>
            </div>

            <span className="text-gray-400">|</span>

            <div className="flex items-center gap-2">
              <span className="text-gray-400">Borders:</span>
              <button
                onClick={() => setBorderColoringEnabled(!borderColoringEnabled)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
                  borderColoringEnabled 
                    ? 'bg-blue-600 text-white shadow-md hover:bg-blue-500' 
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500 hover:text-white'
                }`}
              >
                {borderColoringEnabled ? '✓ ON' : '✗ OFF'}
              </button>
            </div>

            <span className="text-gray-400">|</span>

            <div className="flex items-center gap-2">
              <span className="text-gray-400">Colors:</span>
              <button
                onClick={() => setSettingsPanelOpen(true)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-full text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95 shadow-md"
              >
                🎨 {COLOR_PRESETS[colorScheme]?.name || 'Custom'}
              </button>
            </div>
          </div>
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
          >
            {globalWeatherMinimized ? 'Expand All' : 'Minimize Weather'}
          </button>
        </div>

        {/* ICAO Filter Controls */}
        <div className="flex flex-wrap justify-center gap-2 items-center bg-gray-700 rounded-lg p-4">
          <span className="text-cyan-300 font-semibold">🔍 Filter:</span>
          <input 
            ref={filterInputRef}
            value={icaoFilter}
            onChange={(e) => setIcaoFilter(e.target.value)}
            placeholder="Filter ICAOs (e.g. CY, JFK, EGLL)" 
            className="bg-gray-800 p-2 rounded text-center w-64 text-white placeholder-gray-400 border border-gray-600 focus:border-cyan-400 focus:outline-none transition-colors"
          />
          <button 
            onClick={handleToggleFilter} 
            className={`px-4 py-2 rounded text-white transition-colors font-medium ${showFilteredOnly ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-gray-600 hover:bg-gray-500'}`}
          >
            {showFilteredOnly ? 'Filter Active' : 'Apply Filter'}
          </button>
          {(icaoFilter || showFilteredOnly) && (
            <button 
              onClick={handleClearFilter} 
              className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-white transition-colors"
            >
              Clear
            </button>
          )}
          <div className="text-sm text-gray-400">
            Showing {filteredICAOs.length} of {weatherICAOs.length} stations
          </div>
        </div>
      </div>
      
      {/* Weather Tiles Grid */}
      <div className="max-w-screen-2xl mx-auto px-6 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
          {filteredICAOs.map((icao, index) => (
            <div key={`${icao}-container`} className="relative transition-all duration-300 ease-out">
              {shouldShowInsertionSpace(icao, 'before') && (
                <div className="absolute -left-4 top-0 bottom-0 w-2 bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400 rounded-full shadow-lg shadow-cyan-400/50 animate-[pulse_1s_ease-in-out_infinite]" />
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
                isAnyModalOpen={isAnyModalOpen}
                onNotamModalStateChange={handleNotamModalStateChange}
              />
              
              {shouldShowInsertionSpace(icao, 'after') && (
                <div className="absolute -right-4 top-0 bottom-0 w-2 bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400 rounded-full shadow-lg shadow-cyan-400/50 animate-[pulse_1s_ease-in-out_infinite]" />
              )}
            </div>
          ))}
        </div>
        
        {/* Empty States */}
        {filteredICAOs.length === 0 && weatherICAOs.length > 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-4">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
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
          </div>
        )}
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        colorScheme={colorScheme}
        setColorScheme={setColorScheme}
        customColors={customColors}
        setCustomColors={setCustomColors}
      />
    </div>
  );
};

export default WeatherMonitorApp;
