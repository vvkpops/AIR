// KeywordHighlight.js - Keyword highlighting feature for weather data
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

// Color options for custom categories
const COLOR_OPTIONS = [
  { name: 'Red', bg: 'bg-red-500', text: 'text-white' },
  { name: 'Orange', bg: 'bg-orange-500', text: 'text-white' },
  { name: 'Yellow', bg: 'bg-yellow-500', text: 'text-black' },
  { name: 'Green', bg: 'bg-green-500', text: 'text-white' },
  { name: 'Blue', bg: 'bg-blue-500', text: 'text-white' },
  { name: 'Purple', bg: 'bg-purple-500', text: 'text-white' },
  { name: 'Pink', bg: 'bg-pink-500', text: 'text-white' },
  { name: 'Cyan', bg: 'bg-cyan-500', text: 'text-black' },
  { name: 'Gray', bg: 'bg-gray-500', text: 'text-white' },
  { name: 'Indigo', bg: 'bg-indigo-500', text: 'text-white' }
];

// Main KeywordHighlightManager component
const KeywordHighlightManager = ({ 
  isOpen, 
  onClose, 
  keywordCategories, 
  setKeywordCategories,
  keywordHighlightEnabled,
  setKeywordHighlightEnabled,
  defaultKeywords
}) => {
  const modalRef = useRef(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_OPTIONS[0]);
  const [newKeywords, setNewKeywords] = useState('');

  // Modal event handlers
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

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;

    const categoryId = newCategoryName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const keywords = newKeywords
      .split(/[,\s]+/)
      .map(k => k.trim().toUpperCase())
      .filter(k => k.length > 0);

    if (keywords.length === 0) return;

    setKeywordCategories(prev => ({
      ...prev,
      [categoryId]: {
        name: newCategoryName.trim(),
        color: newCategoryColor.bg,
        textColor: newCategoryColor.text,
        keywords: keywords,
        enabled: true,
        custom: true
      }
    }));

    setNewCategoryName('');
    setNewKeywords('');
    setNewCategoryColor(COLOR_OPTIONS[0]);
  };

  const handleDeleteCategory = (categoryId) => {
    setKeywordCategories(prev => {
      const newCategories = { ...prev };
      delete newCategories[categoryId];
      return newCategories;
    });
  };

  const handleToggleCategory = (categoryId) => {
    setKeywordCategories(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        enabled: !prev[categoryId].enabled
      }
    }));
  };

  const handleUpdateKeywords = (categoryId, keywordsString) => {
    const keywords = keywordsString
      .split(/[,\s]+/)
      .map(k => k.trim().toUpperCase())
      .filter(k => k.length > 0);

    setKeywordCategories(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        keywords: keywords
      }
    }));
  };

  const handleResetToDefaults = () => {
    setKeywordCategories({ ...defaultKeywords });
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay modal-backdrop-blur modal-animate">
      <div ref={modalRef} className="modal-content-fixed bg-gray-800 rounded-xl shadow-2xl border border-gray-600 max-w-4xl">
        {/* Header */}
        <div className="modal-header-fixed flex justify-between items-center border-b border-gray-700 p-6 bg-gray-900 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold">🎯</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-cyan-400">Keyword Highlighting</h3>
              <p className="text-gray-400 text-sm">Highlight important weather terms in METAR and TAF data</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-4xl font-light focus:outline-none hover:bg-gray-700 rounded-full w-12 h-12 flex items-center justify-center transition-all duration-200"
          >
            ×
          </button>
        </div>

        <div className="modal-body-scrollable p-6 space-y-6">
          {/* Master Toggle */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-cyan-300 mb-1">Enable Keyword Highlighting</h4>
                <p className="text-sm text-gray-400">Turn on/off all keyword highlighting in weather data</p>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={keywordHighlightEnabled}
                  onChange={(e) => setKeywordHighlightEnabled(e.target.checked)}
                  className="sr-only"
                />
                <div className={`relative w-14 h-8 rounded-full transition-colors duration-200 ${
                  keywordHighlightEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}>
                  <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-200 ${
                    keywordHighlightEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </div>
              </label>
            </div>
          </div>

          {/* Current Categories */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-cyan-300">Keyword Categories</h4>
              <button
                onClick={handleResetToDefaults}
                className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
            
            <div className="space-y-4">
              {Object.entries(keywordCategories).map(([categoryId, category]) => (
                <div key={categoryId} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={category.enabled}
                          onChange={() => handleToggleCategory(categoryId)}
                          className="sr-only"
                        />
                        <div className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${
                          category.enabled ? 'bg-green-500' : 'bg-gray-600'
                        }`}>
                          <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                            category.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </div>
                      </label>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${category.color} ${category.textColor}`}>
                        {category.name}
                      </span>
                      <span className="text-gray-400 text-sm">
                        {category.keywords.length} keywords
                      </span>
                    </div>
                    {category.custom && (
                      <button
                        onClick={() => handleDeleteCategory(categoryId)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  
                  <div className="mb-2">
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Keywords (space or comma separated):
                    </label>
                    <textarea
                      value={category.keywords.join(' ')}
                      onChange={(e) => handleUpdateKeywords(categoryId, e.target.value)}
                      className="w-full bg-gray-700 text-white p-2 rounded text-sm font-mono"
                      rows="2"
                    />
                  </div>
                  
                  <div className="flex flex-wrap gap-1">
                    {category.keywords.slice(0, 10).map((keyword, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-1 rounded text-xs font-mono ${category.color} ${category.textColor}`}
                      >
                        {keyword}
                      </span>
                    ))}
                    {category.keywords.length > 10 && (
                      <span className="text-gray-400 text-xs px-2 py-1">
                        +{category.keywords.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add New Category */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-lg font-semibold text-cyan-300 mb-4">Add Custom Category</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Category Name:
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full bg-gray-700 text-white p-2 rounded"
                  placeholder="e.g., Custom Alerts"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Color:
                </label>
                <select
                  value={COLOR_OPTIONS.findIndex(c => c.bg === newCategoryColor.bg)}
                  onChange={(e) => setNewCategoryColor(COLOR_OPTIONS[parseInt(e.target.value)])}
                  className="w-full bg-gray-700 text-white p-2 rounded"
                >
                  {COLOR_OPTIONS.map((color, idx) => (
                    <option key={idx} value={idx}>{color.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Keywords (space or comma separated):
              </label>
              <textarea
                value={newKeywords}
                onChange={(e) => setNewKeywords(e.target.value)}
                className="w-full bg-gray-700 text-white p-2 rounded font-mono"
                rows="3"
                placeholder="e.g., LLWS WS RWY12 PIREP TURB"
              />
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim() || !newKeywords.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded transition-colors"
              >
                Add Category
              </button>
              
              {newCategoryName && newKeywords && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">Preview:</span>
                  <span className={`px-3 py-1 rounded text-sm font-bold ${newCategoryColor.bg} ${newCategoryColor.text}`}>
                    {newCategoryName}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Usage Instructions */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-lg font-semibold text-cyan-300 mb-3">How It Works</h4>
            <div className="text-sm text-gray-400 space-y-2">
              <p>• Keywords are highlighted in both METAR and TAF data displayed on weather tiles</p>
              <p>• Keywords are case-insensitive and match whole words</p>
              <p>• Multiple categories can be enabled simultaneously with different colors</p>
              <p>• Custom categories are saved automatically and persist between sessions</p>
              <p>• Default categories include common aviation weather terms</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer-fixed border-t border-gray-700 p-4 bg-gray-900 text-center rounded-b-xl">
          <button
            onClick={onClose}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')
  );
};

// Utility function to highlight text with keywords
export const highlightKeywords = (text, keywordCategories) => {
  if (!text || typeof text !== 'string' || !keywordCategories) {
    return text;
  }

  // Get all enabled categories and their keywords
  const allKeywords = Object.values(keywordCategories)
    .filter(category => category.enabled && category.keywords.length > 0)
    .flatMap(category => 
      category.keywords.map(keyword => ({
        keyword: keyword.toUpperCase(),
        category: category
      }))
    );
  
  // Sort by keyword length (descending) to match longer keywords first (e.g., "+SN" before "SN")
  allKeywords.sort((a, b) => b.keyword.length - a.keyword.length);

  if (allKeywords.length === 0) {
    return text;
  }

  // Create a regex that finds any of the keywords as whole words
  const regex = new RegExp(`\\b(${allKeywords.map(k => k.keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})\\b`, 'g');
  
  // Create a map for quick lookup of keyword to category
  const keywordMap = allKeywords.reduce((acc, { keyword, category }) => {
    if (!acc[keyword]) {
      acc[keyword] = category;
    }
    return acc;
  }, {});
  
  return text.replace(regex, (match) => {
    const category = keywordMap[match.toUpperCase()];
    if (category) {
      return `<span class="keyword-highlight ${category.color} ${category.textColor}" title="Category: ${category.name}">${match}</span>`;
    }
    return match;
  });
};

export default KeywordHighlightManager;
