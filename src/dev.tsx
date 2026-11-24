import { Agentation } from 'agentation';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './main';

createRoot(document.getElementById('agentation-root')!).render(
  <Agentation appName="环讯 Atlas" enableKeyboardShortcuts={false} />,
);

new EventSource('/esbuild').addEventListener('change', () => window.location.reload());
