import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

const NotamModal = ({ icao, isOpen, onClose, notamData, loading, error }) => {
  const modalRef = useRef(null);
  const scrollPositionRef = useRef(0);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    let scrollY = 0;

    if (isOpen) {
      // Store current scroll position
      scrollY = window.scrollY;
      scrollPositionRef.current = scrollY;
      
      // Add event listener
      document.addEventListener('mousedown', handleClickOutside);
      
      // Prevent body scroll and maintain position
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflowY = 'scroll'; // Keep scrollbar to prevent layout shift
    } else {
      // Restore body styles
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
      
      // Restore scroll position
      window.scrollTo(0, scrollPositionRef.current);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

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

  // Enhanced function to clean up NOTAM text for display
  const cleanNotamText = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return rawText;
    
    // Remove excessive whitespace and normalize line breaks
    let cleaned = rawText
      .replace(/\\n/g, '\n')        // Convert \n to actual newlines
      .replace(/\s+/g, ' ')         // Replace multiple spaces with single space
      .replace(/\n\s+/g, '\n')      // Remove spaces at start of lines
      .replace(/\s+\n/g, '\n')      // Remove spaces at end of lines
      .replace(/\n{3,}/g, '\n\n')   // Replace multiple newlines with max 2
      .trim();
    
    // If this still looks like escaped JSON, try to extract the meaningful parts
    if (cleaned.includes('"raw"') || cleaned.includes('"english"') || cleaned.includes('"french"')) {
      try {
        const jsonData = JSON.parse(cleaned);
        // Priority: english > raw > french
        if (jsonData.english && typeof jsonData.english === 'string') {
          cleaned = jsonData.english.replace(/\\n/g, '\n');
        } else if (jsonData.raw && typeof jsonData.raw === 'string') {
          cleaned = jsonData.raw.replace(/\\n/g, '\n');
        } else if (jsonData.french && typeof jsonData.french === 'string') {
          cleaned = jsonData.french.replace(/\\n/g, '\n');
        }
      } catch (e) {
        // Manual extraction if JSON parsing fails
        const patterns = [
          /"english"\s*:\s*"([^"]+)"/,
          /"raw"\s*:\s*"([^"]+)"/,
          /"french"\s*:\s*"([^"]+)"/
        ];
        
        for (const pattern of patterns) {
          const match = cleaned.match(pattern);
          if (match && match[1]) {
            cleaned = match[1].replace(/\\n/g, '\n');
            break;
          }
        }
      }
    }
    
    // Final cleanup
    cleaned = cleaned
      .replace(/\\n/g, '\n')
      .replace(/\s+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\s+\n/g, '\n')
      .trim();
    
    return cleaned;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not specified';
    if (dateStr === 'PERMANENT') return 'PERMANENT';
    
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

  const getNotamPriorityColor = (summary = '') => {
    const text = summary.toLowerCase();
    if (text.includes('closed') || text.includes('clsd')) return 'bg-red-600';
    if (text.includes('rsc')) return 'bg-orange-600';
    if (text.includes('crfi')) return 'bg-yellow-600';
    if (text.includes('runway') || text.includes('rwy')) return 'bg-purple-600';
    return 'bg-gray-600';
  };

  const getNotamTypeLabel = (notam) => {
    // Extract type from NOTAM number if available
    if (notam.number) {
      const firstChar = notam.number.charAt(0);
      switch (firstChar.toUpperCase()) {
        case 'Q': return 'AERODROME';
        case 'H': return 'ENROUTE';
        case 'V': return 'OBSTACLE';
        case 'N': return 'NAVIGATION';
        default: return notam.type || 'NOTAM';
      }
    }
    return notam.type || 'NOTAM';
  };

  // Render the modal using React Portal
  return ReactDOM.createPortal(
    <div className="modal-overlay modal-backdrop-blur modal-animate">
      <div ref={modalRef} className="modal-content-fixed bg-gray-800 rounded-xl shadow-2xl border border-gray-600">
        {/* Header */}
        <div className="modal-header-fixed flex justify-between items-center border-b border-gray-700 p-6 bg-gray-900 rounded-t-xl">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold">📋</span>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-cyan-400">NOTAMs for {icao}</h3>
              <p className="text-gray-400 text-sm">Notice to Airmen - Current Active NOTAMs</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-4xl font-light focus:outline-none hover:bg-gray-700 rounded-full w-12 h-12 flex items-center justify-center transition-all duration-200"
            title="Close NOTAMs"
          >
            ×
          </button>
        </div>
        
        {/* Content */}
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
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-cyan-400 font-semibold text-lg">
                    📊 Total NOTAMs Found: {notamData.length}
                  </span>
                  <span className="text-gray-400 text-sm">
                    🔗 Source: {icao.startsWith('C') ? 'FAA + NAV CANADA CFPS' : 'FAA NOTAM System'} • Updated: {new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>
              
              {/* NOTAM Cards */}
              {notamData.map((notam, index) => {
                const priorityColor = getNotamPriorityColor(notam.summary || notam.description);
                const isActive = notam.validFrom && notam.validTo && notam.validTo !== 'PERMANENT' ? 
                  (new Date() >= new Date(notam.validFrom) && new Date() <= new Date(notam.validTo)) : true;
                const isPermanent = notam.validTo === 'PERMANENT';
                const typeLabel = getNotamTypeLabel(notam);
                
                // Clean the NOTAM text
                const cleanedBody = cleanNotamText(notam.body);
                const cleanedSummary = cleanNotamText(notam.summary);
                
                return (
                  <div key={index} className="bg-gray-900 rounded-lg border border-gray-600 overflow-hidden hover:border-gray-500 transition-colors">
                    <div className="bg-gray-800 px-6 py-4 border-b border-gray-600">
                      <div className="flex justify-between items-start flex-wrap gap-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-orange-400 font-bold text-xl">
                            {notam.number || `NOTAM ${index + 1}`}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${priorityColor}`}>
                            {typeLabel}
                          </span>
                          {isActive && !isPermanent && (
                            <span className="px-3 py-1 bg-green-600 text-white text-xs rounded-full font-bold animate-pulse">
                              ● ACTIVE
                            </span>
                          )}
                          {isPermanent && (
                            <span className="px-3 py-1 bg-red-600 text-white text-xs rounded-full font-bold">
                              PERMANENT
                            </span>
                          )}
                          {icao.startsWith('C') && notam.number && notam.number.includes('CFPS') && (
                            <span className="px-3 py-1 bg-blue-600 text-white text-xs rounded-full font-bold">
                              NAV CANADA
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
                    
                    {/* NOTAM Body */}
                    <div className="p-6 space-y-5">
                      {(cleanedSummary || cleanedBody) && (
                        <div>
                          <h5 className="text-cyan-400 font-semibold mb-3 flex items-center gap-2">
                            <span>📝</span>
                            NOTAM Text
                          </h5>
                          <div className="bg-gray-800 p-4 rounded-lg border-l-4 border-orange-500">
                            <pre className="text-gray-100 leading-relaxed text-sm whitespace-pre-wrap font-mono">
                              {cleanedBody || cleanedSummary}
                            </pre>
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
                              {formatDate(notam.validTo)}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {notam.qLine && (
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <h6 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
                            <span>📋</span>
                            Q-Line Code
                          </h6>
                          <p className="text-gray-200 font-mono text-xs">{notam.qLine}</p>
                        </div>
                      )}
                      
                      {/* Raw text section - only show if different from cleaned version */}
                      {notam.body && notam.body !== cleanedBody && (
                        <details className="group">
                          <summary className="cursor-pointer text-gray-400 hover:text-gray-200 font-semibold flex items-center gap-2 p-2 bg-gray-800 rounded transition-colors group-open:bg-gray-700">
                            <span className="transform group-open:rotate-90 transition-transform">▶</span>
                            🔍 View Original Raw Text
                          </summary>
                          <div className="mt-3 bg-black p-4 rounded border border-gray-700">
                            <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">
                              {notam.body}
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
        </div>
        
        {/* Footer */}
        <div className="modal-footer-fixed border-t border-gray-700 p-4 bg-gray-900 text-center rounded-b-xl">
          <p className="text-gray-400 text-sm">
            📡 NOTAMs from {icao.startsWith('C') ? 'FAA + NAV CANADA CFPS' : 'FAA'} • 
            <span className="text-orange-400 font-semibold"> Always verify with official sources before flight</span>
          </p>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')
  );
};

export default NotamModal;
