/**
 * React SPA entry point.
 * Mounts the App component into the DOM root element.
 */

import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(<App />);
