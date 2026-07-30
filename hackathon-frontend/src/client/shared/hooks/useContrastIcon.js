import { useTheme } from '@/shared/components/theme-provider/theme-provider';

/**
 * Returns the correct icon (or src) for the current theme and active state.
 * @param {Object} params
 * @param {boolean} params.isActive - Whether the icon is active
 * @param {string} [params.theme] - Optional theme override ('light' or 'dark')
 * @param {*} params.lightIcon - Icon or src for light mode
 * @param {*} params.darkIcon - Icon or src for dark mode
 * @returns {*} The icon or src to use
 */
export function useContrastIcon({
  isActive,
  theme: themeProp,
  lightIcon,
  darkIcon,
}) {
  const contextTheme = useTheme().theme;
  const theme = themeProp || contextTheme;
  const isDark = theme === 'dark';
  if (isActive) {
    return isDark ? lightIcon : darkIcon;
  } else {
    return isDark ? darkIcon : lightIcon;
  }
}
