import { createRoot } from 'react-dom/client';
import '@app/styles/fonts.css';
import '@app/styles/tokens.css';
import '@app/styles/base.css';
import '@app/styles/pages.css';
import { AppRouter } from './router';

const rootEl = document.getElementById('root');
if (rootEl) {
    createRoot(rootEl).render(<AppRouter />);
}
