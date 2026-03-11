import { useState } from 'react';
import { Search } from 'lucide-react';

export function SearchBar({ value, onChange, onSearch, skills = [], placeholder }) {
  const [showDropdown, setShowDropdown] = useState(false);

  const trimmed = value.trim();

  const filteredSuggestions = trimmed
    ? skills.filter(s => s.name.toLowerCase().includes(trimmed.toLowerCase()))
    : [];

  const exactMatch = skills.some(
    s => s.name.toLowerCase() === trimmed.toLowerCase()
  );

  const showSearchOption = trimmed && !exactMatch;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && trimmed && onSearch) {
      onSearch(trimmed);
      setShowDropdown(false);
    }
  };

  const handleSuggestionClick = (skill) => {
    onChange(skill.name);
    if (onSearch) onSearch(skill.name);
    setShowDropdown(false);
  };

  const handleSearchForQuery = () => {
    if (trimmed && onSearch) {
      onSearch(trimmed);
      setShowDropdown(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center bg-white rounded-full shadow-lg px-2 py-2">
        <Search className="w-5 h-5 text-gray-400 ml-3 flex-shrink-0" />
        <input
          type="text"
          placeholder={placeholder || 'Search skills...'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          className="flex-grow px-4 py-2 text-gray-700 text-lg focus:outline-none bg-transparent"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="mr-2 text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {showDropdown && (filteredSuggestions.length > 0 || showSearchOption) && (
        <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-2xl mt-2 z-50 overflow-hidden border border-gray-100">
          {filteredSuggestions.map((skill) => (
            <button
              key={skill.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSuggestionClick(skill)}
              className="w-full text-left px-5 py-3 hover:bg-gray-50 text-gray-800 flex items-center justify-between"
            >
              <span>{skill.name}</span>
              {skill.status === 'scraping' && (
                <span className="text-xs text-yellow-500 font-medium">loading…</span>
              )}
            </button>
          ))}

          {showSearchOption && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSearchForQuery}
              className="w-full text-left px-5 py-3 hover:bg-purple-50 text-purple-700 font-medium border-t border-gray-100 flex items-center space-x-2"
            >
              <Search className="w-4 h-4 flex-shrink-0" />
              <span>Search for &ldquo;{trimmed}&rdquo;</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
