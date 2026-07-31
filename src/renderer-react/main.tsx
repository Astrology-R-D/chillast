import { createRoot } from 'react-dom/client';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('React root element is missing');
}

createRoot(rootElement).render(
  <main aria-label="CHILLAST React renderer">React renderer bootstrap</main>,
);
