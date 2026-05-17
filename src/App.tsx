import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useMidi } from './hooks/useMidi';
import { MidiStatus } from './components/shared/MidiStatus';
import { FunctionView } from './components/views/FunctionView';
import { ChainView } from './components/views/ChainView';
import { ManifoldView } from './components/views/ManifoldView';
import { KeyboardView } from './components/views/KeyboardView';
import { TopologyView } from './components/views/TopologyView';
import { useTopologyStore } from './stores/topologyStore';
import styles from './App.module.css';

function AppShell() {
  useMidi();
  const { topology } = useTopologyStore();

  return (
    <div className={styles.shell}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoText}>ARPULATOR</span>
          <span className={styles.logoSub}>{topology.name}</span>
        </div>
        <nav className={styles.nav}>
          <NavLink to="/function" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navActive : ''}`}>
            FUNCTION
          </NavLink>
          <NavLink to="/chain" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navActive : ''}`}>
            CHAIN
          </NavLink>
          <NavLink to="/manifold" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navActive : ''}`}>
            MANIFOLD
          </NavLink>
          <NavLink to="/keyboard" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navActive : ''}`}>
            KEYBOARD
          </NavLink>
          <NavLink to="/topology" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navActive : ''}`}>
            TOPOLOGY
          </NavLink>
        </nav>
        <div className={styles.midiArea}>
          <MidiStatus />
        </div>
      </header>

      {/* Content */}
      <main className={styles.content}>
        <Routes>
          <Route path="/" element={<Navigate to="/function" replace />} />
          <Route path="/function" element={<FunctionView />} />
          <Route path="/chain" element={<ChainView />} />
          <Route path="/manifold" element={<ManifoldView />} />
          <Route path="/keyboard" element={<KeyboardView />} />
          <Route path="/topology" element={<TopologyView />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
