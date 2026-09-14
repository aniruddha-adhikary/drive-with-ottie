import { Suspense, useEffect, useState } from 'react';
import { DevelopmentBanner } from './components/DevelopmentBanner';
import { FEATURE_ROUTES, findRoute, routePathFromHash } from './routes';

function useHashPath(): string {
  const [path, setPath] = useState(() => routePathFromHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setPath(routePathFromHash(window.location.hash));
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);
  return path;
}

/**
 * Web shell: development banner, the active feature route (the lesson by default) and a compact
 * footer with the remaining routes. Feature modules live under apps/web/src/features/<name>/ and are
 * registered in apps/web/src/routes.tsx.
 */
export function App(): React.JSX.Element {
  const path = useHashPath();
  const route = findRoute(path);
  const Feature = route.component;

  return (
    <div className="ottie-shell">
      <DevelopmentBanner />
      <Suspense
        fallback={
          <p className="ottie-type-explanation" style={{ padding: '1rem' }} aria-busy="true">
            Loading {route.label}…
          </p>
        }
      >
        <Feature />
      </Suspense>
      <footer className="ottie-footer">
        <nav aria-label="Development routes">
          {FEATURE_ROUTES.map((r) => (
            <a key={r.path} href={`#${r.path}`} aria-current={r.path === route.path ? 'page' : undefined} style={{ marginRight: '0.75rem' }}>
              {r.label}
            </a>
          ))}
        </nav>
        Build mode: {__OTTIE_BUILD_MODE__}. Device-local only; no accounts, no sync. No content here is release-approved.
      </footer>
    </div>
  );
}
