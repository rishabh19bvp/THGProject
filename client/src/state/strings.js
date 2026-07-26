import { createElement, createContext, useContext, useEffect, useState } from 'react';
import { fetchStrings } from './api';

const StringsContext = createContext(null);

export function useStrings() {
  const ctx = useContext(StringsContext);
  if (!ctx) throw new Error('useStrings must be used within StringsProvider');
  return ctx;
}

export function StringsProvider({ children }) {
  const [strings, setStrings] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const delays = [1000, 2000, 4000, 8000];
      for (let attempt = 0; ; attempt += 1) {
        try {
          const data = await fetchStrings();
          if (!cancelled) setStrings(data);
          return;
        } catch (e) {
          const delay = delays[Math.min(attempt, delays.length - 1)];
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (cancelled) return;
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!strings) return null;

  return createElement(StringsContext.Provider, { value: strings }, children);
}
