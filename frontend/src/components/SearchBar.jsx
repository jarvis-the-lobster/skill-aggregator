import { useState } from 'react';
import { Search } from 'lucide-react';
import analytics from '../services/analytics';

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
      analytics.searchSubmitted(trimmed, { source: 'search_input_enter' });
      onSearch(trimmed);
      setShowDropdown(false);
    }
  };

  const handleSuggestionClick = (skill) => {
    setShowDropdown(false);
    analytics.searchSuggestionClicked(skill.id, skill.name, { source: 'search_dropdown' });
    if (onSuggestionSelect) {
      onSuggestionSelect(skill);
    } else {
      onChange(skill.name);
      if (onSearch) onSearch(skill.name);
    }
  };

  const handleSearchForQuery = () => {
    if (trimmed && onSearch) {
      analytics.searchSubmitted(trimmed, { source: 'search_dropdown_cta' });
      onSearch(trimmed);
      setShowDropdown(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center rounded-full border border-white/70 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.28)] px-2 py-2 transition-all duration-200 focus-within:border-teal/70 focus-within:shadow-[0_22px_55px_rgba(0,191,166,0.18)]">
        <Search className="ml-3 h-5 w-5 flex-shrink-0 text-slate-500" />
        <input
          type="text"
          placeholder={placeholder || 'Search skills...'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          className="flex-grow bg-transparent px-4 py-2 text-lg text-slate-900 focus:outline-none placeholder-slate-400"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="mr-2 text-xl leading-none text-slate-400 transition-colors hover:text-slate-600"
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
