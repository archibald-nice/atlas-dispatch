import { createRoot } from 'react-dom/client';
import { App } from './App';
import { validateSnapshot } from './domain';
import snapshot from './data/snapshot.json';
import { getStoredLocale, messages } from './i18n';

const root = createRoot(document.getElementById('root')!);
try {
  root.render(<App initialSnapshot={validateSnapshot(snapshot)} />);
} catch (error) {
  const locale = getStoredLocale();
  const t = messages[locale];
  document.documentElement.lang = locale;
  document.title = t.meta.title;
  root.render(<main className="fatal-error"><span>{t.fatal.eyebrow}</span><h1>{t.fatal.title}</h1><p>{t.fatal.fallback}</p>{error instanceof Error && <p>{error.message}</p>}<p>{t.fatal.instructions}</p></main>);
}
