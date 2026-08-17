import { useEffect, useRef, useState } from 'react';
import { searchFamilies } from '../../lib/families';
import type { FamilyOption } from '../../lib/families';
import { SearchIcon } from '../../components/layout/Icons';

interface FamilySearchSelectProps {
  selectedId: string;
  selectedName: string;
  onSelect: (familyId: string, familyName: string) => void;
  onClear: () => void;
  placeholder?: string;
}

// A plain <select> can't scale to this app's dev data (1600+ accumulated test families) without
// silently truncating the list alphabetically — search-as-you-type against the real backend
// `search` filter (GET /families?search=) is the only version of this picker that stays correct
// regardless of how large the family table grows.
const FamilySearchSelect = ({ selectedId, selectedName, onSelect, onClear, placeholder = 'Search family by name…' }: FamilySearchSelectProps) => {
  const [query, setQuery] = useState(selectedName);
  const [results, setResults] = useState<FamilyOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(selectedName), [selectedName]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open || query === selectedName) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      searchFamilies(query.trim())
        .then(setResults)
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="pat-search" style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <SearchIcon />
        <input
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedId) onClear();
            setOpen(true);
          }}
        />
      </div>
      {open && (
        <div className="pat-menu" style={{ width: '100%', top: 44, maxHeight: 240, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: '10px 14px', fontSize: 13, color: '#94a3b8' }}>Searching…</div>
          )}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 13, color: '#94a3b8' }}>No families found.</div>
          )}
          {!loading && query.trim().length < 2 && (
            <div style={{ padding: '10px 14px', fontSize: 13, color: '#94a3b8' }}>Type at least 2 characters…</div>
          )}
          {results.map((fam) => (
            <button
              key={fam.family_id}
              onClick={() => {
                onSelect(String(fam.family_id), fam.family_name);
                setQuery(fam.family_name);
                setOpen(false);
              }}
            >
              {fam.family_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FamilySearchSelect;
