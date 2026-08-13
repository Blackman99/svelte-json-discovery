// docs-wide theme state; the JsonViewer instances follow it
const initial = (document.documentElement.dataset.theme ?? 'light') as 'light' | 'dark';

export const theme = $state<{ current: 'light' | 'dark' }>({ current: initial });

export function toggleTheme() {
    theme.current = theme.current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme.current;
    localStorage.setItem('sjd-theme', theme.current);
}
