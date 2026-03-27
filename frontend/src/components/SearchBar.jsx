import { useState } from 'react';
import { Search } from 'lucide-react';

export function SearchBar({ value, onChange, onSearch, onSuggestionSelect, skills = [], placeholder }) {
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
    setShowDropdown(false);
    if (onSuggestionSelect) {
      onSuggestionSelect(skill);
    } else {
      onChange(skill.name);
      if (onSearch) onSearch(skill.name);
    }
  };

  const handleSearchForQuery = () => {
    if (trimmed && onSearch) {
      onSearch(trimmed);
      setShowDropdown(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center bg-[#141929] border border-white/[0.08] rounded-full shadow-lg px-2 py-2">
        <Search className="w-5 h-5 text-slate-500 ml-3 flex-shrink-0" />
        <input
          type="text"
          placeholder={placeholder || 'Search skills...'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          className="flex-grow px-4 py-2 text-slate-100 text-lg focus:outline-none bg-transparent placeholder-slate-500"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="mr-2 text-slate-500 hover:text-slate-300 text-xl leading-none"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {showDropdown && (filteredSuggestions.length > 0 || showSearchOption) && (
        <div className="absolute top-full left-0 right-0 bg-[#141929] shadow-xl rounded-2xl mt-2 z-[100] overflow-hidden border border-white/[0.08]">
          {filteredSuggestions.map((skill) => (
            <button
              key={skill.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSuggestionClick(skill)}
              className="w-full text-left px-5 py-3 hover:bg-white/[0.06] text-slate-200 flex items-center justify-between"
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
              className="w-full text-left px-5 py-3 hover:bg-teal/10 text-teal font-medium border-t border-white/[0.08] flex items-center space-x-2"
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
