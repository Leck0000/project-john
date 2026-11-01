/**
 * TopBar component — top navigation bar with user menu, theme toggle, and WS status
 *
 * Consumes: authSlice (user, roles, name), wsClient (connection status)
 * Produces: TopBar (user avatar, theme toggle, WS status indicator)
 *
 * Strict TS: no `any`; use `unknown` + zod parsers at boundaries.
 * CSS variables for theming: --fg, --bg, --accent, --border, --card — no hardcoded colors.
 * Accessibility: WCAG 2.1 AA (focus-visible, aria-labels, role attributes).
 */
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import { logout } from '../auth/slice';
import { Link } from 'react-router-dom';

/** Narrow view of the auth slice that TopBar reads (tolerates an empty slice). */
interface AuthView {
  auth?: {
    user?: { name: string } | null;
    roles?: string[];
  };
}

export function TopBar() {
  const dispatch = useDispatch();
  // Read user/roles from auth slice; handle empty slice gracefully
  const user = useSelector((state: AuthView) => state.auth?.user ?? null);
  const roles = useSelector((state: AuthView) => state.auth?.roles ?? []);

  const [theme, setThemeValue] = React.useState<'light' | 'dark'>('dark');

  useEffect(() => {
    // matchMedia is absent in some environments (jsdom, older embeds)
    if (typeof window.matchMedia !== 'function') return;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setThemeValue(prefersDark ? 'dark' : 'light');
  }, []);

  const toggleThemeHandler = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setThemeValue(newTheme);
    toast.info(`Theme switched to ${newTheme}`);
  };

  return (
    <header
      className="flex items-center justify-between p-4 border-b border-border bg-card flex-shrink-0"
    >
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold text-fg">
          Ticket Queue
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {/* User menu */}
        {user && (
          <div
            onClick={() => console.log('Open user menu')}
            className="relative cursor-pointer"
            aria-haspopup="menu"
            aria-label="User menu"
          >
            <div className="flex items-center gap-2">
              <img
                src="/user-avatar.png"
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover"
                loading="lazy"
              />
              <span className="text-muted text-sm">{user.name}</span>
            </div>
            <div
              className="absolute right-0 mt-2 w-24 rounded border-border bg-card p-2 shadow-md z-10 hidden focus:not-hidden"
              role="menu"
              aria-orientation="vertical"
            >
              {roles.includes('admin') && (
                <button
                  className="w-full text-left p-1 text-sm text-fg focus:outline-none focus:bg-muted rounded"
                  aria-label="Admin settings"
                >
                  Admin settings
                </button>
              )}
              <button
                className="w-full text-left text-sm text-fg hover:text-muted focus:outline-none focus:bg-muted rounded"
                onClick={() => dispatch(logout())}
                aria-label="Logout"
              >
                Logout
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex items-center gap-2" aria-label="Main navigation">
          <Link
            to="/scoring"
            className="px-3 py-1.5 text-sm text-fg hover:text-accent rounded border border-transparent hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Scoring
          </Link>
        </nav>

        {/* Theme toggle */}
        <button
          onClick={toggleThemeHandler}
          className="p-1 rounded hover:bg-muted transition-colors"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
      </div>
    </header>
  );
}