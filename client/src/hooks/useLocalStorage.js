import { useState, useEffect } from 'react';

export function useLocalStorage(key, initialValue, delay = 500) {
  // Helper to evaluate initialValue if it's a function
  const getInitialValue = () => {
    return initialValue instanceof Function ? initialValue() : initialValue;
  };

  // State to store our value
  const [storedValue, setStoredValue] = useState(() => {
    if (typeof window === "undefined" || !key) {
      return getInitialValue();
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : getInitialValue();
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return getInitialValue();
    }
  });

  // Effect to debounce writing to localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !key) return;

    const handler = setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(storedValue));
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    }, delay);

    return () => clearTimeout(handler);
  }, [key, storedValue, delay]);

  const clearValue = () => {
    setStoredValue(getInitialValue());
    if (typeof window !== "undefined" && key) {
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        console.warn(`Error removing localStorage key "${key}":`, error);
      }
    }
  };

  return [storedValue, setStoredValue, clearValue];
}
