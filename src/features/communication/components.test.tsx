/** ChatPanel / EmailThread / TicketDetail tabs: sending, delivery state, requester replies. */
import { describe, it, expect } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';
import communicationReducer, { receiveRequesterMessage } from './slice';
import wsReducer, { initialWSState } from '../../shared/ws/slice';
import ticketsReducer, { setQueue, selectTicket } from '../tickets/slice';
import desktopReducer from '../desktop/slice';
import { WSActionType } from '../../shared/ws/events';
import { ChatPanel } from './ChatPanel';
import { EmailThread } from './EmailThread';
import { TicketDetail } from '../tickets/TicketDetail';
import { DEMO_TICKETS } from '../../app/demo';

const demoTicket = DEMO_TICKETS[0];
if (!demoTicket) throw new Error('no demo tickets');
const TICKET = demoTicket.id;

function setup(ui: React.ReactElement, connected: boolean) {
  const sent: UnknownAction[] = [];
  const recorder: Middleware = () => (next) => (action) => {
    const a = action as UnknownAction;
    if (a.type === WSActionType.SEND) sent.push(a);
    return next(action);
  };
  const store = configureStore({
    reducer: { communication: communicationReducer, ws: wsReducer, tickets: ticketsReducer, desktop: desktopReducer },
    preloadedState: { ws: { ...initialWSState, connected } },
    middleware: (gdm) => gdm().concat(recorder),
  });
  render(<Provider store={store}>{ui}</Provider>);
  return { store, sent };
}

describe('ChatPanel', () => {
  it('sends on Enter, shows the message as sent and clears the input', () => {
    const { sent } = setup(<ChatPanel ticketId={TICKET} />, true);
    const input = screen.getByRole('textbox', { name: 'Chat message' });
    fireEvent.change(input, { target: { value: 'Have you tried rebooting?' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sent).toHaveLength(1);
    const log = screen.getByRole('log', { name: 'Chat messages' });
    expect(within(log).getByText('Have you tried rebooting?')).toBeInTheDocument();
    expect(within(log).getByText(/Sent/)).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('keeps an undelivered message and says so when not connected', () => {
    const { sent } = setup(<ChatPanel ticketId={TICKET} />, false);
    expect(screen.getByText(/Not connected to a lab session/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Chat message' }), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(sent).toHaveLength(0);
    expect(screen.getByText(/Not delivered — not connected/)).toBeInTheDocument();
  });

  it('announces a validation error for an empty message', () => {
    setup(<ChatPanel ticketId={TICKET} />, true);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Message is empty');
  });

  it('shows requester replies', () => {
    const { store } = setup(<ChatPanel ticketId={TICKET} />, true);
    act(() => {
      store.dispatch(receiveRequesterMessage({ ticketId: TICKET, from: 'requester', message: 'Still locked out', timestamp: new Date().toISOString() }));
    });
    expect(screen.getByText('Still locked out')).toBeInTheDocument();
    expect(screen.getByText(/Requester ·/)).toBeInTheDocument();
  });
});

describe('EmailThread', () => {
  it('sends subject + body over add_ticket_message and lists the email', () => {
    const { sent } = setup(<EmailThread ticketId={TICKET} defaultSubject="Password reset" />, true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Email body' }), { target: { value: 'Please try the new password.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));
    expect(sent[0]?.payload).toEqual({
      type: 'add_ticket_message',
      payload: { ticketId: TICKET, message: 'Subject: Password reset\n\nPlease try the new password.' },
    });
    const log = screen.getByRole('log', { name: 'Emails' });
    expect(within(log).getByRole('heading', { name: 'Password reset' })).toBeInTheDocument();
    expect(within(log).getByText('Please try the new password.')).toBeInTheDocument();
  });

  it('threads a requester reply as "Re:" and suggests it for the next email', () => {
    const { store } = setup(<EmailThread ticketId={TICKET} defaultSubject="Password reset" />, true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Email body' }), { target: { value: 'Try now.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));
    act(() => {
      store.dispatch(receiveRequesterMessage({ ticketId: TICKET, from: 'requester', message: 'Works, thanks', timestamp: new Date().toISOString() }));
    });
    expect(screen.getByRole('heading', { name: 'Re: Password reset' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email subject' })).toHaveAttribute('placeholder', 'Re: Password reset');
  });

  it('requires a subject', () => {
    setup(<EmailThread ticketId={TICKET} />, true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Email body' }), { target: { value: 'body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Subject is empty');
  });
});

describe('TicketDetail detail rows', () => {
  it('keeps Machine and Requester values in their original case', () => {
    const { store } = setup(<TicketDetail />, true);
    act(() => {
      store.dispatch(setQueue(DEMO_TICKETS));
      store.dispatch(selectTicket(TICKET));
    });
    const valueOf = (label: string) => {
      const dd = screen.getByText(label, { selector: 'dt' }).nextElementSibling;
      if (!dd) throw new Error(`no value for ${label}`);
      return dd;
    };
    expect(valueOf('Machine')).not.toHaveClass('capitalize');
    expect(valueOf('Machine')).toHaveClass('normal-case');
    expect(valueOf('Requester')).not.toHaveClass('capitalize');
    expect(valueOf('Requester')).toHaveClass('normal-case');
    expect(valueOf('Queue')).toHaveClass('capitalize');
  });
});

describe('TicketDetail communication tabs', () => {
  it('switches between chat and email for the selected ticket', () => {
    const { store } = setup(<TicketDetail />, true);
    act(() => {
      store.dispatch(setQueue(DEMO_TICKETS));
      store.dispatch(selectTicket(TICKET));
    });
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toContainElement(screen.getByRole('textbox', { name: 'Chat message' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Email' }));
    expect(screen.getByRole('tab', { name: 'Email' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Email subject' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Chat message' })).not.toBeInTheDocument();
  });
});
