import React, { useState, useEffect, useRef } from 'react';

export default function AutocompleteInput({ value, onChange, placeholder, required }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }

    // Don't search if the query is exactly a selected suggestion
    if (suggestions.some(s => s.display_name === query)) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
        const data = await res.json();
        setSuggestions(data);
        setIsOpen(true);
      } catch (err) {
        console.error('Error fetching autocomplete:', err);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (suggestion) => {
    // Simplify the display name (city, state/country)
    const addr = suggestion.address;
    const city = addr.city || addr.town || addr.village || addr.county;
    const state = addr.state || addr.country;
    let displayName = suggestion.display_name;

    if (city && state) {
      displayName = `${city}, ${state}`;
    }

    setQuery(displayName);
    onChange(displayName);
    setIsOpen(false);
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        className="w-full bg-slate-950 border border-slate-700 focus:border-teal-400 rounded-lg px-3 py-2 text-sm text-white outline-none transition"
      />

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.place_id}
              onClick={() => handleSelect(suggestion)}
              className="px-3 py-2 cursor-pointer hover:bg-teal-500/20 text-slate-300 text-sm border-b border-slate-800 last:border-0"
            >
              {suggestion.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
