import { useEffect, useState } from 'react';
import App from './App';
import SimulationPage from './pages/SimulationPage';
import './pages/SimulationPage.css';

type Route = 'demo' | 'simulation';

const routeFromHash = (): Route => (window.location.hash.startsWith('#/simulation') ? 'simulation' : 'demo');

/**
 * Two parts of the site: the live demo and the simulation study. The demo stays mounted (just hidden)
 * while you read the study, so a connected Arduino and a running trip are not interrupted.
 */
export default function Root() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [visitedSimulation, setVisitedSimulation] = useState(route === 'simulation');

  useEffect(() => {
    const onChange = () => {
      const next = routeFromHash();
      setRoute(next);
      if (next === 'simulation') setVisitedSimulation(true);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return (
    <>
      <nav className="topnav">
        <a className="topnav__brand" href="#/">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
          Smart Parking
        </a>
        <a className={`topnav__link ${route === 'demo' ? 'is-on' : ''}`} href="#/">
          Live demo
        </a>
        <a className={`topnav__link ${route === 'simulation' ? 'is-on' : ''}`} href="#/simulation">
          Simulation study
        </a>
      </nav>
      <div hidden={route !== 'demo'}>
        <App />
      </div>
      {visitedSimulation && (
        <div hidden={route !== 'simulation'}>
          <SimulationPage />
        </div>
      )}
    </>
  );
}
