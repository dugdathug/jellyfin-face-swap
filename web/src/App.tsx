import { useState, useEffect, useMemo, useCallback } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import {
  Film,
  Users,
  Zap,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { type Theme, ThemeContext } from "./lib/theme";
import { cn } from "./lib/utils";

import Library from "./pages/Library";
import Faces from "./pages/Faces";
import Jobs from "./pages/Jobs";
import SettingsPage from "./pages/Settings";

const NAV_ITEMS = [
  { to: "/library", icon: Film, label: "Library" },
  { to: "/faces", icon: Users, label: "Faces" },
  { to: "/jobs", icon: Zap, label: "Jobs" },
  { to: "/settings", icon: SettingsIcon, label: "Settings" },
] as const;

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;
const THEME_CYCLE: Theme[] = ["light", "dark", "system"];

function useMediaDark() {
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return dark;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("jfswap-theme") as Theme) || "system"
  );
  const systemDark = useMediaDark();
  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    localStorage.setItem("jfswap-theme", theme);
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [theme, resolved]);

  const cycleTheme = useCallback(() => {
    setTheme((t) => THEME_CYCLE[(THEME_CYCLE.indexOf(t) + 1) % 3]);
  }, []);

  const themeCtx = useMemo(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved]
  );

  const ThemeIcon = THEME_ICONS[theme];

  return (
    <ThemeContext.Provider value={themeCtx}>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <nav className="glass-strong flex w-16 flex-col items-center gap-1 py-4 rounded-r-[var(--radius-glass)]">
          {/* Logo */}
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-card)] bg-[var(--primary)]">
            <Film className="h-5 w-5 text-[var(--primary-foreground)]" />
          </div>

          {/* Nav links */}
          <div className="flex flex-1 flex-col gap-1">
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "group relative flex h-10 w-10 items-center justify-center rounded-[var(--radius-button)] transition-all duration-200",
                    isActive
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md"
                      : "text-[var(--foreground-muted)] hover:bg-[var(--color-glass-hover)] hover:text-[var(--foreground)]"
                  )
                }
              >
                <Icon className="h-[18px] w-[18px]" />
                {/* Tooltip */}
                <span className="pointer-events-none absolute left-14 rounded-lg bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 whitespace-nowrap border border-[var(--border-subtle)]">
                  {label}
                </span>
              </NavLink>
            ))}
          </div>

          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-button)] text-[var(--foreground-muted)] transition-colors hover:bg-[var(--color-glass-hover)] hover:text-[var(--foreground)]"
            title={`Theme: ${theme}`}
          >
            <ThemeIcon className="h-[18px] w-[18px]" />
          </button>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route path="/library" element={<Library />} />
            <Route path="/faces" element={<Faces />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </ThemeContext.Provider>
  );
}
