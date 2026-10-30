import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import desktopReducer, { openAppWindow, appendTerminalOutput } from './slice';
import wsReducer, { initialWSState } from '../../shared/ws/slice';
import { WSActionType, ClientEventType } from '../../shared/ws/events';
import { TerminalWindow } from './TerminalWindow';
import { WindowManager } from './WindowManager';

// xterm needs a real canvas; replace it with a recorder.
const xterm = vi.hoisted(() => ({
  instances: [] as Array<{ out: string[]; type: (data: string) => void }>,
}));
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    out: string[] = [];
    private handlers: Array<(d: string) => void> = [];
    constructor() {
      xterm.instances.push({ out: this.out, type: (d) => this.handlers.forEach((h) => h(d)) });
    }
    loadAddon() {}
    open() {}
    write(d: string) {
      this.out.push(d);
    }
    writeln(d: string) {
      this.out.push(d + '\n');
    }
    clear() {}
    focus() {}
    dispose() {}
    onData(h: (d: string) => void) {
      this.handlers.push(h);
      return { dispose() {} };
    }
  },
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));

function setup(connected: boolean, machineId = 'm1') {
  const actions: string[] = [];
  const payloads: unknown[] = [];
  const recorder: Middleware = () => (next) => (action) => {
    const a = action as { type: string; payload?: unknown };
    actions.push(a.type);
    payloads.push(a.payload);
    return next(action);
  };
  const store = configureStore({
    reducer: { desktop: desktopReducer, ws: wsReducer },
    preloadedState: { ws: { ...initialWSState, connected, sessionId: connected ? 's1' : null } },
    middleware: (gdm) => gdm().concat(recorder),
  });
  store.dispatch(openAppWindow({ app: 'Terminal', title: 'Terminal', machineId }));
  const win = store.getState().desktop.windows[0];
  if (!win) throw new Error('no window');
  render(
    <Provider store={store}>
      <TerminalWindow windowId={win.id} />
    </Provider>
  );
  const term = xterm.instances.at(-1);
  if (!term) throw new Error('xterm not created');
  return { store, term, actions, payloads };
}

describe('TerminalWindow', () => {
  beforeEach(() => {
    xterm.instances.length = 0;
  });

  it('renders the embedded Terminal component as a region labelled with the machine', () => {
    setup(false);
    const region = screen.getByRole('region', { name: 'Terminal for m1' });
    expect(region).toHaveAttribute('data-testid', 'terminal');
    expect(screen.getByTestId('terminal-window')).toContainElement(region);
  });

  it('labels the terminal with the hostname, not the raw machine UUID', () => {
    setup(false, '3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b03');
    expect(screen.getByRole('region', { name: 'Terminal for ws-hr-02' })).toBeInTheDocument();
  });

  it('applies CSS variable theming', () => {
    setup(false);
    const wrapper = screen.getByTestId('terminal-window');
    expect(wrapper.style.backgroundColor).toBe('var(--bg)');
    expect(wrapper.style.color).toBe('var(--fg)');
  });

  it('opens inside window chrome: a dialog named after the window, with the terminal inside', async () => {
    const store = configureStore({
      reducer: { desktop: desktopReducer, ws: wsReducer },
      preloadedState: { ws: { ...initialWSState } },
    });
    store.dispatch(openAppWindow({ app: 'Terminal', title: 'Terminal — m1', machineId: 'm1' }));
    render(
      <Provider store={store}>
        <WindowManager />
      </Provider>
    );
    const dialog = screen.getByRole('dialog', { name: 'Terminal — m1' });
    expect(dialog.style.backgroundColor).toBe('var(--card)');
    expect(within(dialog).getByRole('button', { name: 'Close window' })).toBeInTheDocument();
    expect(await within(dialog).findByRole('region', { name: 'Terminal for m1' })).toBeInTheDocument();
  });

  it('prints a prompt and an offline notice when not connected; does not send', () => {
    const { term, actions } = setup(false);
    expect(term.out.join('')).toContain('Not connected');
    expect(term.out.join('')).toContain('m1> ');
    act(() => term.type('dir\r'));
    expect(term.out.join('')).toContain('(offline) command not sent');
    expect(actions).not.toContain(WSActionType.SEND);
  });

  it('shows the machine hostname, not its id, in the greeting and prompt', () => {
    const { term } = setup(false, '3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b03');
    const text = term.out.join('');
    expect(text).toContain('remote shell — ws-hr-02');
    expect(text).toContain('ws-hr-02> ');
    expect(text).not.toContain('3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b03> ');
  });

  it('sends the typed line as send_command on Enter when connected', () => {
    const { term, actions, payloads } = setup(true);
    act(() => term.type('ipconfiq\u007fg\r'));
    const i = actions.indexOf(WSActionType.SEND);
    expect(i).toBeGreaterThan(-1);
    expect(payloads[i]).toEqual({
      type: ClientEventType.SEND_COMMAND,
      payload: { machineId: 'm1', command: 'ipconfig' },
    });
  });

  it('writes server output for its machine into the terminal', () => {
    const { store, term } = setup(true);
    act(() => {
      store.dispatch(appendTerminalOutput({ machineId: 'm1', output: 'IPv4 Address: 10.0.0.5' }));
      store.dispatch(appendTerminalOutput({ machineId: 'other', output: 'not mine' }));
    });
    const text = term.out.join('');
    expect(text).toContain('IPv4 Address: 10.0.0.5');
    expect(text).not.toContain('not mine');
  });
});
