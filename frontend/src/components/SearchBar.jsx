import { Search } from 'lucide-react';

export function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center bg-white rounded-full shadow-lg px-2 py-2">
      <Search className="w-5 h-5 text-gray-400 ml-3 flex-shrink-0" />
      <input
        type="text"
        placeholder={placeholder || 'Search skills...'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  );
}
