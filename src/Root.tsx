import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import App from './App';
import Icon, { type IconName } from './components/Icons';
import OverviewPage from './pages/OverviewPage';
import SimulationPage from './pages/SimulationPage';
import { ignoreShortcut, SHORTCUTS } from './shortcuts';
import { toggleTheme, useTheme } from './theme';
import './shell.css';

type Route = 'overview' | 'demo' | 'simulation';

const REPO = 'https://github.com/Idosssss/SmartParking-1';

function routeFromHash(): Route {
  const hash = window.location.hash;
  if (hash.startsWith('#/simulation')) return 'simulation';
  if (hash.startsWith('#/demo')) return 'demo';
  return 'overview';
}

const NAV: { route: Route; href: string; label: string; icon: IconName }[] = [
  { route: 'overview', href: '#/', label: 'Overview', icon: 'home' },
  { route: 'demo', href: '#/demo', label: 'Live demo', icon: 'lot' },
  { route: 'simulation', href: '#/simulation', label: 'Simulation study', icon: 'chart' },
];

const RESOURCES: { href: string; label: string; icon: IconName }[] = [
  { href: `${REPO}/blob/main/docs/USER_GUIDE.md`, label: 'User guide', icon: 'book' },
  { href: `${REPO}/blob/main/docs/USER_GUIDE.he.md`, label: 'מדריך למשתמש', icon: 'book' },
  { href: `${REPO}/tree/main/docs`, label: 'Documentation', icon: 'file' },
  { href: `${REPO}`, label: 'Source code', icon: 'code' },
  { href: `${import.meta.env.BASE_URL}Smart-Parking-Simulation-Report.pdf`, label: 'Study report (PDF)', icon: 'file' },
];

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="keys" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="keys-title">
      <div className="keys__head">
        <h2 id="keys-title">Keyboard shortcuts</h2>
        <button className="topbar__icon" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <dl className="keys__list">
        {SHORTCUTS.map((s) => (
          <div key={s.what}>
            <dt>
              {s.keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{s.what}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}

/**
 * The frame of the site: a tinted sidebar and top bar around one sheet that holds the page.
 * The live demo stays mounted (just hidden) while you read the other pages, so a connected Arduino and a
 * running trip are not interrupted.
 */
export default function Root() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [visited, setVisited] = useState<Set<Route>>(() => new Set([route]));
  const [menuOpen, setMenuOpen] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const theme = useTheme();
  const sheetRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);

  // The grey "you are here" pill slides between pages instead of jumping.
  useLayoutEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) setIndicator({ top: active.offsetTop, height: active.offsetHeight });
  }, [route]);

  useEffect(() => {
    const onChange = () => {
      const next = routeFromHash();
      setRoute(next);
      setMenuOpen(false);
      setVisited((v) => (v.has(next) ? v : new Set(v).add(next)));
      sheetRef.current?.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreShortcut(e)) return;
      const page = NAV[Number(e.key) - 1];
      if (page) window.location.hash = page.href.slice(1);
      else if (e.key === 'd' || e.key === 'D') toggleTheme();
      else if (e.key === '?') setShowKeys(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = NAV.find((n) => n.route === route)!;

  return (
    <div className="shell" data-menu={menuOpen ? 'open' : 'closed'}>
      <aside className="sidebar" aria-label="Main">
        <a className="sidebar__brand" href="#/">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={28} height={28} />
          <span>Smart Parking</span>
        </a>
        <div className="sidebar__scope">
          <span className="sidebar__scope-name">Technion IoT lab</span>
          <span className="sidebar__scope-meta">Lot A · 32 spots · 1 real sensor</span>
        </div>

        <nav className="sidebar__nav sidebar__nav--pages" aria-label="Pages" ref={navRef}>
          {indicator && <span className="sidebar__indicator" style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height }} aria-hidden="true" />}
          {NAV.map((item, i) => (
            <a key={item.route} href={item.href} className="sidebar__item" aria-current={route === item.route ? 'page' : undefined}>
              <Icon name={item.icon} />
              {item.label}
              <kbd className="sidebar__key" aria-hidden="true">
                {i + 1}
              </kbd>
            </a>
          ))}
        </nav>

        <div className="sidebar__group">Project</div>
        <nav className="sidebar__nav" aria-label="Project links">
          {RESOURCES.map((item) => (
            <a key={item.label} href={item.href} className="sidebar__item" target="_blank" rel="noreferrer">
              <Icon name={item.icon} />
              {item.label}
              <span className="sidebar__external">
                <Icon name="external" size={12} />
              </span>
            </a>
          ))}
        </nav>

        <div className="sidebar__foot">
          <span>Ido Tal</span>
          <span>Aviv Elimelech</span>
          <span>Harry Cohen</span>
        </div>
      </aside>

      <header className="topbar">
        <button className="topbar__menu" onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </button>
        <nav className="topbar__crumbs" aria-label="Breadcrumb">
          <span>Smart Parking</span>
          <Icon name="chevron" size={12} />
          <strong>{current.label}</strong>
        </nav>
        <div className="topbar__tools">
          <button className="topbar__icon only-keyboard" onClick={() => setShowKeys(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Icon name="keyboard" />
          </button>
          <button
            className="topbar__icon topbar__theme"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title="Theme (D)"
          >
            <span key={theme} className="topbar__theme-icon">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </span>
          </button>
        </div>
      </header>

      <main className="sheet" ref={sheetRef}>
        {visited.has('overview') && (
          <div hidden={route !== 'overview'}>
            <OverviewPage />
          </div>
        )}
        {visited.has('simulation') && (
          <div hidden={route !== 'simulation'}>
            <SimulationPage />
          </div>
        )}
        <div hidden={route !== 'demo'}>
          <App active={route === 'demo'} />
        </div>
      </main>

      {showKeys && <ShortcutsDialog onClose={() => setShowKeys(false)} />}
    </div>
  );
}
