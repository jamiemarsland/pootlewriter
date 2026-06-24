export type Theme = 'light' | 'dark';

const THEME_KEY = 'writing-app-theme';

export const saveTheme = (theme: Theme) => {
  localStorage.setItem(THEME_KEY, theme);
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

export const loadTheme = (): Theme => {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme;
  }
  // Default to dark mode instead of checking system preferences
  return 'dark';
};