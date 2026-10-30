/**
 * TicketDetail — the selected ticket: summary, actions and message thread.
 *
 * Consumes: ticketsSlice (selected ticket), claimTicket thunk, desktopSlice (open a
 *           terminal on the ticket's machine), communication (chat + email tabs)
 * Strict TS: no `any`. Theming via Tailwind tokens mapped to CSS variables.
 * Accessibility: labelled form controls; status changes announced via role="status".
 */
import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { selectSelectedTicket, claimTicket } from './slice';
import { openAppWindow } from '../desktop/slice';
import { defaultMachineId, machineLabel } from '../../app/demo';
import { ChatPanel } from '../communication/ChatPanel';
import { EmailThread } from '../communication/EmailThread';

type Channel = 'chat' | 'email';
const CHANNELS: Array<{ id: Channel; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'email', label: 'Email' },
];

export function TicketDetail() {
  const dispatch = useAppDispatch();
  const ticket = useAppSelector(selectSelectedTicket);
  const [channel, setChannel] = useState<Channel>('chat');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setNotice(null);
  }, [ticket?.id]);

  if (!ticket) {
    return (
      <div data-testid="ticket-detail-empty" className="flex h-full items-center justify-center p-8 text-muted">
        Select a ticket to see its details.
      </div>
    );
  }

  const machineId = ticket.relatedMachineId ?? defaultMachineId();

  const claim = async () => {
    try {
      await dispatch(claimTicket(ticket.id));
      setNotice('Ticket claimed.');
    } catch (err) {
      setNotice(`Claim failed: ${err instanceof Error ? err.message : 'server unavailable'}`);
    }
  };

  return (
    <article data-testid="ticket-detail" aria-labelledby="ticket-title" className="flex h-full flex-col">
      <header className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-muted">#{ticket.id.slice(0, 8)}</p>
            <h1 id="ticket-title" className="text-xl font-semibold text-fg">
              {ticket.category ?? ticket.queue}
            </h1>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() =>
                dispatch(openAppWindow({ app: 'Terminal', title: `Terminal — ${machineLabel(machineId)}`, machineId }))
              }
              className="rounded border border-border px-3 py-1.5 text-sm text-fg hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Open terminal
            </button>
            <button
              type="button"
              onClick={claim}
              disabled={ticket.state !== 'open'}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Claim
            </button>
          </div>
        </div>
        {notice && (
          <p role="status" className="mt-2 text-sm text-muted">
            {notice}
          </p>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-4 border-b border-border p-4 text-sm md:grid-cols-4">
        {[
          ['Queue', ticket.queue],
          ['Priority', ticket.priority],
          ['State', ticket.state.replace('_', ' ')],
          ['Machine', machineLabel(machineId)],
          ['Assignee', ticket.assignedTechnicianId ?? 'Unassigned'],
          ['Created', new Date(ticket.createdAt).toLocaleString()],
          ['Evidence', `${ticket.evidence.length} item(s)`],
          ['Requester', ticket.requesterId],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="font-medium capitalize text-fg">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-label="Communication" className="flex min-h-0 flex-1 flex-col p-4">
        <div role="tablist" aria-label="Communication channel" className="mb-3 flex gap-1 border-b border-border">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              id={`tab-${c.id}`}
              aria-selected={channel === c.id}
              aria-controls={`panel-${c.id}`}
              tabIndex={channel === c.id ? 0 : -1}
              onClick={() => setChannel(c.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                const next = channel === 'chat' ? 'email' : 'chat';
                setChannel(next);
                document.getElementById(`tab-${next}`)?.focus();
              }}
              className={`-mb-px border-b-2 px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                channel === c.id ? 'border-accent font-semibold text-fg' : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${channel}`} aria-labelledby={`tab-${channel}`} className="flex min-h-0 flex-1 flex-col">
          {channel === 'chat' ? (
            <ChatPanel ticketId={ticket.id} />
          ) : (
            <EmailThread ticketId={ticket.id} defaultSubject={ticket.category ?? ticket.queue} />
          )}
        </div>
      </section>
    </article>
  );
}
