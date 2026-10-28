import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import App from './App';
import Icon, { type IconName } from './components/Icons';
import SimulationPage from './pages/SimulationPage';
import './shell.css';

type Route = 'demo' | 'simulation';

const REPO = 'https://github.com/AvivEli1/SmartParking';
const routeFromHash = (): Route => (window.location.hash.startsWith('#/simulation') ? 'simulation' : 'demo');

const NAV: { route: Route; href: string; label: string; icon: IconName }[] = [
  { route: 'demo', href: '#/', label: 'Live demo', icon: 'lot' },
  { route: 'simulation', href: '#/simulation', label: 'Simulation study', icon: 'chart' },
];

const RESOURCES: { href: string; label: string; icon: IconName }[] = [
  { href: `${REPO}/tree/main/docs`, label: 'Documentation', icon: 'book' },
  { href: `${REPO}`, label: 'Source code', icon: 'code' },
  { href: `${import.meta.env.BASE_URL}Smart-Parking-Simulation-Report.pdf`, label: 'Study report (PDF)', icon: 'file' },
];

/**
 * The frame of the site: a tinted sidebar and top bar around one white sheet that holds the page.
 * The live demo stays mounted (just hidden) while you read the study, so a connected Arduino and a
 * running trip are not interrupted.
 */
export default function Root() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [visitedSimulation, setVisitedSimulation] = useState(route === 'simulation');
  const [menuOpen, setMenuOpen] = useState(false);
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
      if (next === 'simulation') setVisitedSimulation(true);
      sheetRef.current?.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
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
          {NAV.map((item) => (
            <a key={item.route} href={item.href} className="sidebar__item" aria-current={route === item.route ? 'page' : undefined}>
              <Icon name={item.icon} />
              {item.label}
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
      </header>

      <main className="sheet" ref={sheetRef}>
        {visitedSimulation && (
          <div hidden={route !== 'simulation'}>
            <SimulationPage />
          </div>
        )}
        <div hidden={route !== 'demo'}>
          <App />
        </div>
      </main>
    </div>
  );
}
