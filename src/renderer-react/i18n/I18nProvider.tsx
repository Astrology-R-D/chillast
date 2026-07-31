import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { LocaleDictionary } from '../api/contracts';

type InterpolationVariables = Record<string, string | number>;

interface I18nContextValue {
  t: (key: string, variables?: InterpolationVariables) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function findTranslation(dictionary: LocaleDictionary, key: string): string | undefined {
  let current: unknown = dictionary;
  for (const segment of key.split('.')) {
    if (
      typeof current !== 'object'
      || current === null
      || Array.isArray(current)
      || !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : undefined;
}

export function I18nProvider({
  dictionary,
  children,
}: {
  dictionary: LocaleDictionary;
  children: ReactNode;
}) {
  const value = useMemo<I18nContextValue>(() => ({
    t: (key, variables = {}) => {
      const translation = findTranslation(dictionary, key);
      if (translation === undefined) return key;

      return translation.replace(/{{\s*([\w.-]+)\s*}}/g, (placeholder, variable: string) =>
        Object.prototype.hasOwnProperty.call(variables, variable)
          ? String(variables[variable])
          : placeholder,
      );
    },
  }), [dictionary]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider');
  return context;
}
