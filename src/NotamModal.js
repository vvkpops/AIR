import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

const NotamModal = ({ icao, isOpen, onClose, notamData, loading, error }) => {
  const modalRef = useRef(null);
  const scrollPositionRef = useRef(0);
  const bodyStylesRef = useRef({});

  // Enhanced page position preservation
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      // Store current scroll position and body styles
      scrollPositionRef.current = window.scrollY;
      bodyStylesRef.current = {
        position: document.body.style.position,
        top: document.body.style.top,
        width: document.body.style.width,
        overflow: document.body.style.overflow,
        overflowY: document.body.style.overflowY,
        paddingRight: document.body.style.paddingRight
      };
      
      // Calculate scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      
      // Add event listener
      document.addEventListener('mousedown', handleClickOutside);
      
      // Prevent body scroll and maintain position
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollPositionRef.current}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`; // Compensate for scrollbar
      
      // Prevent scrolling on the html element as well
      document.documentElement.style.overflow = 'hidden';
      
    } else {
      // Restore all body styles
      Object.keys(bodyStylesRef.current).forEach(key => {
        document.body.style[key] = bodyStylesRef.current[key];
      });
      
      // Restore html overflow
      document.documentElement.style.overflow = '';
      
      // Restore scroll position with smooth scrolling disabled temporarily
      const originalScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, scrollPositionRef.current);
      document.documentElement.style.scrollBehavior = originalScrollBehavior;
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

  // Copy to clipboard function
  const copyToClipboard = async (text, notamNumber = '') => {
    try {
      await navigator.clipboard.writeText(text);
      // Show a brief success indicator
      const button = event.target;
      const originalText = button.textContent;
      button.textContent = '✓ Copied!';
      button.classList.add('bg-green-600');
      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('bg-green-600');
      }, 2000);
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
        console.log('Text copied using fallback method');
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
      const cleanedBody = cleanNotamText(notam.body);
      const cleanedSummary = cleanNotamText(notam.summary);
      const text = cleanedBody || cleanedSummary || 'No text available';
      
      return `=== NOTAM ${index + 1}: ${notam.number || `${icao}-${index + 1}`} ===
Location: ${notam.location || icao}
Valid From: ${formatDate(notam.validFrom)}
Valid To: ${formatDate(notam.validTo)}
Type: ${getNotamTypeLabel(notam)}

${text}

`;
    }).join('\n');
    
    const fullText = `NOTAMs for ${icao} - Generated: ${new Date().toLocaleString()}
Total NOTAMs: ${notamData.length}

${allNotamsText}`;
    
    copyToClipboard(fullText);
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
          <div className="flex items-center gap-3">
            {/* Copy All Button */}
            {notamData && notamData.length > 0 && (
              <button
                onClick={copyAllNotams}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2"
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
                const displayText = cleanedBody || cleanedSummary;
                
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
                        <div className="flex items-center gap-3">
                          {notam.location && (
                            <div className="flex items-center gap-1 text-gray-400 text-sm">
                              <span>📍</span>
                              <span>{notam.location}</span>
                            </div>
                          )}
                          {/* Individual Copy Button */}
                          <button
                            onClick={() => copyToClipboard(displayText || 'No text available', notam.number)}
                            className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-xs font-medium transition-all duration-200 flex items-center gap-1"
                            title="Copy this NOTAM to clipboard"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                            </svg>
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* NOTAM Body - Enhanced for text selection */}
                    <div className="p-6 space-y-5">
                      {displayText && (
                        <div>
                          <h5 className="text-cyan-400 font-semibold mb-3 flex items-center gap-2">
                            <span>📝</span>
                            NOTAM Text
                            <span className="text-xs text-gray-500 ml-2">(Click and drag to select text)</span>
                          </h5>
                          <div className="bg-gray-800 p-4 rounded-lg border-l-4 border-orange-500 relative group">
                            {/* Selection-friendly text container */}
                            <div 
                              className="text-gray-100 leading-relaxed text-sm whitespace-pre-wrap font-mono select-text cursor-text hover:bg-gray-750 transition-colors p-2 rounded border border-transparent hover:border-gray-600"
                              style={{ 
                                userSelect: 'text',
                                WebkitUserSelect: 'text',
                                MozUserSelect: 'text',
                                msUserSelect: 'text'
                              }}
                              onMouseDown={(e) => e.stopPropagation()} // Prevent modal drag interference
                              onTouchStart={(e) => e.stopPropagation()} // Prevent modal touch interference
                            >
                              {displayText}
                            </div>
                            
                            {/* Copy overlay hint */}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-700 text-white text-xs px-2 py-1 rounded pointer-events-none">
                              Select text to copy
                            </div>
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
                            <p className="text-gray-200 font-mono text-sm select-text">
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
                            <p className="text-gray-200 font-mono text-sm select-text">
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
                          <p className="text-gray-200 font-mono text-xs select-text">{notam.qLine}</p>
                        </div>
                      )}
                      
                      {/* Raw text section - Enhanced for text selection */}
                      {notam.body && notam.body !== displayText && (
                        <details className="group">
                          <summary className="cursor-pointer text-gray-400 hover:text-gray-200 font-semibold flex items-center gap-2 p-2 bg-gray-800 rounded transition-colors group-open:bg-gray-700 select-none">
                            <span className="transform group-open:rotate-90 transition-transform">▶</span>
                            🔍 View Original Raw Text
                          </summary>
                          <div className="mt-3 bg-black p-4 rounded border border-gray-700 relative">
                            <div 
                              className="text-green-400 text-xs font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed select-text cursor-text hover:bg-gray-900 transition-colors p-2 rounded"
                              style={{ 
                                userSelect: 'text',
                                WebkitUserSelect: 'text',
                                MozUserSelect: 'text',
                                msUserSelect: 'text'
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                            >
                              {notam.body}
                            </div>
                            <button
                              onClick={() => copyToClipboard(notam.body, notam.number)}
                              className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs transition-colors"
                              title="Copy raw text"
                            >
                              Copy Raw
                            </button>
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
