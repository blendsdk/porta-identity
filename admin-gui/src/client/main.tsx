/**
 * React SPA entry point.
 * Full implementation in Phase 5.
 */

import { createRoot } from 'react-dom/client';

/** Minimal placeholder — renders root element */
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<div>Porta Admin — Loading...</div>);
}
