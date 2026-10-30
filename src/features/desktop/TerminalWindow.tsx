/**
 * TerminalWindow — terminal content for a desktop window, bound to the
 * window's machine.
 *
 * Consumes: desktopSlice (windowId -> machineId, terminalOutput[machineId]),
 *           wsSlice (connection state), wsSend (send_command via wsMiddleware)
 * Produces: line-edited shell prompt; Enter sends the command; output from the
 *           server (ws command_output -> desktop.terminalOutput) is written in.
 *
 * Strict TS: no `any`. Theming via CSS variables.
 */
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { Terminal, type TerminalHandle } from '../../shared/components/Terminal';
import { wsSend, createSendCommand, ClientEventType } from '../../shared/ws/events';
import { machineLabel } from '../../app/demo';

export interface TerminalWindowProps {
  windowId: string;
}

const EMPTY: string[] = [];

export function TerminalWindow({ windowId }: TerminalWindowProps) {
  const dispatch = useAppDispatch();
  const connected = useAppSelector((state) => state.ws.connected);
  const machineId = useAppSelector(
    (state) => state.desktop.windows.find((w) => w.id === windowId)?.machineId ?? windowId
  );
  const output = useAppSelector((state) => state.desktop.terminalOutput[machineId] ?? EMPTY);

  const term = useRef<TerminalHandle>(null);
  const line = useRef('');
  const written = useRef(0);
  const hostname = machineLabel(machineId);
  const prompt = `${hostname}> `;

  // Greeting + first prompt once the terminal is mounted.
  useEffect(() => {
    term.current?.writeln(`Project:John remote shell — ${hostname}`);
    if (!connected) term.current?.writeln('Not connected to a lab session; commands will not run.');
    term.current?.write(prompt);
    // Only on mount: later connection changes are reported inline.
  }, []);

  // Write any server output that arrived since the last render.
  useEffect(() => {
    if (output.length < written.current) written.current = 0; // buffer was trimmed
    const fresh = output.slice(written.current);
    written.current = output.length;
    if (fresh.length === 0) return;
    term.current?.write('\r\n' + fresh.join(''));
    term.current?.write('\r\n' + prompt + line.current);
  }, [output, prompt]);

  const runCommand = (command: string) => {
    if (!command) return;
    if (!connected) {
      term.current?.writeln('(offline) command not sent');
      return;
    }
    dispatch(wsSend({ type: ClientEventType.SEND_COMMAND, payload: createSendCommand(machineId, command) }));
  };

  const onData = (data: string) => {
    for (const ch of data) {
      if (ch === '\r') {
        const command = line.current.trim();
        line.current = '';
        term.current?.write('\r\n');
        runCommand(command);
        term.current?.write(prompt);
      } else if (ch === '\u007f') {
        if (line.current.length > 0) {
          line.current = line.current.slice(0, -1);
          term.current?.write('\b \b');
        }
      } else if (ch >= ' ') {
        line.current += ch;
        term.current?.write(ch);
      }
    }
  };

  return (
    <div
      data-testid="terminal-window"
      style={{ height: '100%', padding: 6, backgroundColor: 'var(--bg)', color: 'var(--fg)' }}
    >
      <Terminal ref={term} ariaLabel={`Terminal for ${hostname}`} onData={onData} />
    </div>
  );
}
