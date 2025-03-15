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
      
      // If no item exists, return initialValue
      if (!item) return initialValue;
      
      // Try to parse the item as JSON, but handle non-JSON values gracefully
      try {
        // Check if the string starts with expected JSON characters
        const trimmedItem = item.trim();
        if (
          (trimmedItem.startsWith('{') && trimmedItem.endsWith('}')) || 
          (trimmedItem.startsWith('[') && trimmedItem.endsWith(']')) ||
          trimmedItem === 'null' ||
          trimmedItem === 'true' ||
          trimmedItem === 'false' ||
          /^-?\d+(\.\d+)?$/.test(trimmedItem) // number
        ) {
          return JSON.parse(trimmedItem);
        } else {
          // For non-JSON values, use the raw string
          console.log(`Using non-JSON value directly for key "${key}": ${item}`);
          return item as unknown as T;
        }
      } catch (parseError) {
        console.warn(`Failed to parse localStorage item for key "${key}", using as raw string:`, parseError);
        return item as unknown as T;
      }
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
        try {
          // Try to stringify as JSON, but handle special types
          if (
            typeof valueToStore === 'object' || 
            typeof valueToStore === 'boolean' ||
            typeof valueToStore === 'number' ||
            valueToStore === null
          ) {
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
          } else {
            // For strings and other non-JSON values, store directly
            window.localStorage.setItem(key, String(valueToStore));
          }
        } catch (stringifyError) {
          // If JSON.stringify fails, convert to string
          console.warn(`Couldn't stringify value for key "${key}", storing as string:`, stringifyError);
          window.localStorage.setItem(key, String(valueToStore));
        }
        
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
            // Try to parse as JSON, but handle non-JSON values gracefully
            try {
              // Check if the string starts with expected JSON characters
              const trimmedValue = (e.newValue as string).trim();
              if (
                (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) || 
                (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) ||
                trimmedValue === 'null' ||
                trimmedValue === 'true' ||
                trimmedValue === 'false' ||
                /^-?\d+(\.\d+)?$/.test(trimmedValue) // number
              ) {
                setStoredValue(JSON.parse(trimmedValue));
              } else {
                // For non-JSON values, use the raw string
                console.log(`Using non-JSON value directly for key "${key}": ${e.newValue}`);
                setStoredValue(e.newValue as unknown as T);
              }
            } catch (parseError) {
              // If parsing fails, use the raw string
              console.log(`Parsing failed, using raw value for key "${key}": ${e.newValue}`);
              setStoredValue(e.newValue as unknown as T);
            }
          }, 0);
        } catch (error) {
          console.error(`Error handling localStorage change for key "${key}":`, error);
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