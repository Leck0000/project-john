/**
 * Workspace — the main technician screen: TopBar, Sidebar (filters + tools),
 * ticket list, ticket detail, and the desktop window layer on top.
 *
 * Consumes: ticketsSlice (queue, selection), wsSlice via TopBar, desktopSlice via WindowManager
 * Strict TS: no `any`. Theming via Tailwind tokens mapped to CSS variables.
 * Responsive: >=1024px fixed sidebar; below that the sidebar is a drawer.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { isDemoMode, DEMO_TICKETS } from '../../app/demo';
import { Toaster } from '../../shared/components/Toaster';
import { wsConnect } from '../../shared/ws/events';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { TicketCard } from '../tickets/TicketCard';
import { TicketDetail } from '../tickets/TicketDetail';
import { fetchTickets, selectFilteredQueue, selectSelectedTicket, selectTicket, setQueue } from '../tickets/slice';
import { WindowManager } from '../desktop/WindowManager';

export function Workspace() {
  const dispatch = useAppDispatch();
  const queue = useAppSelector(selectFilteredQueue);
  const selected = useAppSelector(selectSelectedTicket);
  const { status, error } = useAppSelector((state) => state.tickets);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Initial data: demo seed over the in-browser sim transport, or the tickets API + WebSocket when configured.
  useEffect(() => {
    if (isDemoMode()) {
      dispatch(setQueue(DEMO_TICKETS));
      dispatch(wsConnect({ url: 'local://sim' }));
      return;
    }
    void dispatch(fetchTickets());
    const wsUrl = import.meta.env.VITE_WS_URL;
    if (typeof wsUrl === 'string' && wsUrl) dispatch(wsConnect({ url: wsUrl }));
  }, [dispatch]);

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar open={drawerOpen} onClose={closeDrawer} />

        <main id="main" className="relative flex min-w-0 flex-1">
          <section aria-labelledby="queue-heading" className="flex w-80 shrink-0 flex-col border-r border-border">
            <div className="flex items-center justify-between border-b border-border p-3">
              <h2 id="queue-heading" className="text-sm font-semibold text-fg">
                Ticket queue <span className="text-muted">({queue.length})</span>
              </h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="rounded border border-border px-2 py-1 text-xs text-fg lg:hidden"
                aria-label="Open filters and tools"
                aria-expanded={drawerOpen}
              >
                ☰ Menu
              </button>
            </div>
            <ul className="flex-1 space-y-2 overflow-y-auto p-3" aria-label="Tickets">
              {status === 'loading' && <li className="text-sm text-muted">Loading tickets…</li>}
              {status !== 'loading' && error && (
                <li role="alert" className="text-sm text-muted">
                  Couldn&apos;t load tickets: {error}
                </li>
              )}
              {status !== 'loading' && !error && queue.length === 0 && (
                <li className="text-sm text-muted">No tickets match the current filters.</li>
              )}
              {queue.map((t) => (
                <li key={t.id}>
                  <TicketCard ticket={t} selected={t.id === selected?.id} onSelect={(id) => dispatch(selectTicket(id))} />
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Ticket detail" className="min-w-0 flex-1 overflow-y-auto">
            <TicketDetail />
          </section>

          <WindowManager />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
