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

  // Helper function to clean up NOTAM text for display
  const cleanNotamText = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return rawText;
    
    // If this looks like the CFPS JSON response format, extract the actual NOTAM text
    if (rawText.includes('"raw"') && rawText.includes('"english"')) {
      try {
        const jsonData = JSON.parse(rawText);
        // Use the raw field which contains the actual NOTAM text
        if (jsonData.raw) {
          rawText = jsonData.raw;
        } else if (jsonData.english) {
          rawText = jsonData.english;
        }
      } catch (e) {
        // If parsing fails, try to extract the raw text manually
        const rawMatch = rawText.match(/"raw"\s*:\s*"([^"]+)"/);
        if (rawMatch) {
          rawText = rawMatch[1];
        } else {
          const englishMatch = rawText.match(/"english"\s*:\s*"([^"]+)"/);
          if (englishMatch) {
            rawText = englishMatch[1];
          }
        }
      }
    }
    
    // Now parse the actual NOTAM text to extract individual NOTAMs
    // Replace \n in the string with actual newlines
    rawText = rawText.replace(/\\n/g, '\n');
    
    // Find NOTAM blocks that start with NOTAM identifier and end after E) section
    const notamBlocks = [];
    const lines = rawText.split('\n');
    let currentBlock = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if this line starts a new NOTAM (pattern like "Q1101/25 NOTAMN" or similar)
      if (line.match(/^[A-Z]\d+\/\d+\s+NOTAM/) || (line.includes('NOTAM') && line.match(/\d+\/\d+/))) {
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
        if (line.match(/^E\)\s/)) {
          // Look ahead to see if next line is empty or starts a new NOTAM
          if (i + 1 >= lines.length || lines[i + 1].trim() === '' || lines[i + 1].match(/^[A-Z]\d+\/\d+\s+NOTAM/)) {
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
    
    // If we found NOTAM blocks, return them all joined with double newlines
    // Otherwise return the cleaned text
    if (notamBlocks.length > 0) {
      return notamBlocks.join('\n\n');
    }
    
    return rawText;
  };
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

  const getNotamPriorityColor = (summary = '') => {
    const text = summary.toLowerCase();
    if (text.includes('closed') || text.includes('clsd')) return 'bg-red-600';
    if (text.includes('rsc')) return 'bg-orange-600';
    if (text.includes('crfi')) return 'bg-yellow-600';
    if (text.includes('runway') || text.includes('rwy')) return 'bg-purple-600';
    return 'bg-gray-600';
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
          ) : notamData && notamData.length > 0 ? (
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
              {/* NOTAM Cards */}
              {notamData.map((notam, index) => {
                const priorityColor = getNotamPriorityColor(notam.summary || notam.description);
                const isActive = notam.validFrom && notam.validTo ? 
                  (new Date() >= new Date(notam.validFrom) && new Date() <= new Date(notam.validTo)) : true;
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
                          {isActive && (
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
                    {/* NOTAM Body */}
                    <div className="p-6 space-y-5">
                      {(notam.description || notam.summary) && (
                        <div>
                          <h5 className="text-cyan-400 font-semibold mb-3 flex items-center gap-2">
                            <span>📝</span>
                            Description
                          </h5>
                          <div className="bg-gray-800 p-4 rounded-lg border-l-4 border-orange-500">
                            <p className="text-gray-100 leading-relaxed text-base">
                              {notam.description || notam.summary}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(notam.validFrom || notam.bLine) && (
                          <div className="bg-gray-800 p-4 rounded-lg">
                            <h6 className="text-green-400 font-semibold mb-2 flex items-center gap-2">
                              <span>🟢</span>
                              Effective From
                            </h6>
                            <p className="text-gray-200 font-mono text-sm">
                              {formatDate(notam.validFrom) || notam.bLine}
                            </p>
                          </div>
                        )}
                        {(notam.validTo || notam.cLine) && (
                          <div className="bg-gray-800 p-4 rounded-lg">
                            <h6 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
                              <span>🔴</span>
                              Valid Until
                            </h6>
                            <p className="text-gray-200 font-mono text-sm">
                              {notam.isPermanent ? 'PERMANENT' : 
                               (formatDate(notam.validTo) || notam.cLine)}
                            </p>
                          </div>
                        )}
                      </div>
                      {notam.schedule && (
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <h6 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
                            <span>📅</span>
                            Schedule
                          </h6>
                          <p className="text-gray-200 font-mono text-sm">{notam.schedule}</p>
                        </div>
                      )}
                      {(notam.lowerLimit || notam.upperLimit || notam.coordinates) && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          {notam.lowerLimit && (
                            <div className="bg-gray-800 p-3 rounded">
                              <span className="text-gray-400 font-semibold text-sm block mb-1">Lower Limit:</span>
                              <p className="text-gray-200 font-mono text-sm">{notam.lowerLimit}</p>
                            </div>
                          )}
                          {notam.upperLimit && (
                            <div className="bg-gray-800 p-3 rounded">
                              <span className="text-gray-400 font-semibold text-sm block mb-1">Upper Limit:</span>
                              <p className="text-gray-200 font-mono text-sm">{notam.upperLimit}</p>
                            </div>
                          )}
                          {notam.coordinates && (
                            <div className="bg-gray-800 p-3 rounded">
                              <span className="text-gray-400 font-semibold text-sm block mb-1">Coordinates:</span>
                              <p className="text-gray-200 font-mono text-xs">{notam.coordinates}</p>
                            </div>
                          )}
                        </div>
                      )}
                      {notam.rawText && (
                        <details className="group">
                          <summary className="cursor-pointer text-gray-400 hover:text-gray-200 font-semibold flex items-center gap-2 p-2 bg-gray-800 rounded transition-colors group-open:bg-gray-700">
                            <span className="transform group-open:rotate-90 transition-transform">▶</span>
                            🔍 View Raw NOTAM Text
                          </summary>
                          <div className="mt-3 bg-black p-4 rounded border border-gray-700">
                            <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">
                              {notam.rawText}
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
            📡 NOTAMs retrieved from FAA NOTAM Search System • 
            <span className="text-orange-400 font-semibold"> Always verify with official sources before flight</span>
          </p>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')
  );
};

export default NotamModal;
