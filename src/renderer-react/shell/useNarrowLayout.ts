import { useEffect, useState } from 'react';

const NARROW_LAYOUT_QUERY = '(max-width: 1199px)';

export function useNarrowLayout(): boolean {
  const [mediaQuery] = useState(() => window.matchMedia(NARROW_LAYOUT_QUERY));
  const [isNarrow, setIsNarrow] = useState(mediaQuery.matches);

  useEffect(() => {
    const updateMatch = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    mediaQuery.addEventListener('change', updateMatch);
    return () => mediaQuery.removeEventListener('change', updateMatch);
  }, [mediaQuery]);

  return isNarrow;
}
