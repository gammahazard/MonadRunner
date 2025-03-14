import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for accessing localStorage with type safety and SSR support
 * @param key - The localStorage key
 * @param initialValue - Default value if nothing is stored
 * @param dispatchEvent - Whether to dispatch a custom event when the value changes
 * @returns [storedValue, setValue] - Tuple with the stored value and update function
 */
export function useLocalStorage<T>(
  key: string, 
  initialValue: T, 
  dispatchEvent: boolean = false
) {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key);
      // Parse stored json or if none return initialValue
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage.
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      
      // Save state
      setStoredValue(valueToStore);
      
      // Save to local storage
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
        
        // Dispatch a custom event when this value changes
        if (dispatchEvent) {
          window.dispatchEvent(
            new CustomEvent('localStorage-updated', {
              detail: {
                key,
                value: valueToStore,
                timestamp: Date.now()
              }
            })
          );
        }
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue, dispatchEvent]);

  // Listen for changes to this localStorage key in other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          // Use setTimeout to avoid updating state during render
          setTimeout(() => {
            setStoredValue(JSON.parse(e.newValue as string));
          }, 0);
        } catch (error) {
          console.error(`Error parsing localStorage change for key "${key}":`, error);
        }
      }
    };
    
    // Also listen for our custom localStorage-updated event
    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.key === key) {
        // Don't update if it's the same value to avoid loops
        const newValue = customEvent.detail.value;
        
        // Use setTimeout to avoid updating state during render
        setTimeout(() => {
          setStoredValue(prev => 
            JSON.stringify(prev) !== JSON.stringify(newValue) ? newValue : prev
          );
        }, 0);
      }
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      window.addEventListener('localStorage-updated', handleCustomEvent as EventListener);
      return () => {
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('localStorage-updated', handleCustomEvent as EventListener);
      };
    }
    return undefined;
  }, [key]);

  return [storedValue, setValue] as const;
}

export default useLocalStorage;