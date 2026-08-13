import { ThemeToggle } from './ThemeToggle';

export function AppFooter() {
    return (
        <footer className="app-footer mono">
            <span>
                Sundew · open source, MIT ·{' '}
                <a href="https://github.com/diet103/sundew">{'GitHub ->'}</a>
            </span>
            <span className="app-footer-right">
                by <a href="https://dietergrosswiler.com">Dieter Grosswiler</a>
                <ThemeToggle />
            </span>
        </footer>
    );
}
