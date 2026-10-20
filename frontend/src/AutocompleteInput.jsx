import React, { useState, useEffect, useRef } from 'react';

export default function AutocompleteInput({ value, onChange, placeholder, required }) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  const fetchSuggestions = async (searchText) => {
    if (!searchText || searchText.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchText)}&limit=5`, {
        headers: { 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const data = await response.json();
      setSuggestions(data);
      setIsOpen(true);
    } catch (err) {
      console.error('Error fetching suggestions', err);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(val);
    }, 500);
  };

  const handleSelect = (suggestion) => {
    const displayName = suggestion.display_name;
    setQuery(displayName);
    onChange(displayName);
    setIsOpen(false);
    setSuggestions([]);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        className="w-full bg-slate-950 border border-slate-700 focus:border-teal-400 rounded-lg px-3 py-2 text-sm text-white outline-none transition"
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto text-sm text-white">
          {suggestions.map((item) => (
            <li
              key={item.place_id}
              onClick={() => handleSelect(item)}
              className="px-3 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700 last:border-0"
            >
              {item.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
