import { useState } from 'react';
import { MoonIcon, SunIcon } from './icons';

// Dark is the shipped default (set before paint by the index.html snippet);
// this button flips the class on <html> and persists the choice. The icon
// shows the theme you'd switch TO, same as the site this app mirrors.

const THEME_KEY = 'sundew:theme';

function isDark(): boolean {
    return document.documentElement.classList.contains('theme-dark');
}

export function ThemeToggle({ className = 'theme-toggle' }: { className?: string }) {
    const [dark, setDark] = useState(isDark);
    const flip = () => {
        const next = !dark;
        document.documentElement.classList.toggle('theme-dark', next);
        try {
            localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
        } catch {
            // private mode: the flip still applies for this page view
        }
        setDark(next);
    };
    return (
        <button
            type="button"
            className={className}
            onClick={flip}
            aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
            title={dark ? 'Light theme' : 'Dark theme'}
        >
            {dark ? <SunIcon /> : <MoonIcon />}
        </button>
    );
}
