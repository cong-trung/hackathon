import { createContext, useContext, useState } from 'react';

const ThemeProviderContext = createContext(null);
const themes = ['midnight', 'intel-light', 'intel-dark'];

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme !== 'intel-light');
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const initial = document.documentElement.dataset.theme;
    return themes.includes(initial) ? initial : 'midnight';
  });

  const value = {
    theme,
    setTheme: (nextTheme) => {
      if (!themes.includes(nextTheme)) return;
      applyTheme(nextTheme);
      setTheme(nextTheme);
      try {
        localStorage.setItem('qm:theme', nextTheme);
      } catch {
        // The current selection still applies when storage is unavailable.
      }
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
