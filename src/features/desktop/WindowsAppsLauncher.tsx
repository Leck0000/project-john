/**
 * WindowsAppsLauncher — sidebar list of simulated Windows tools.
 * Clicking an entry opens a desktop window for the selected ticket's machine
 * (or a default lab machine when no ticket is selected).
 */
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { selectSelectedTicket } from '../tickets/slice';
import { openAppWindow } from './slice';
import { APP_KEYS, APP_REGISTRY } from './apps';
import { LAB_DEFAULT_MACHINE_ID, defaultMachineId, machineLabel } from '../../app/demo';

export const DEFAULT_MACHINE_ID = LAB_DEFAULT_MACHINE_ID;

export function WindowsAppsLauncher() {
  const dispatch = useAppDispatch();
  const ticket = useAppSelector(selectSelectedTicket);
  const machineId = ticket?.relatedMachineId ?? defaultMachineId();

  return (
    <ul className="space-y-1" aria-label="Windows tools">
      {APP_KEYS.map((app) => {
        const { title, icon } = APP_REGISTRY[app];
        return (
          <li key={app}>
            <button
              type="button"
              data-testid={`launch-${app}`}
              onClick={() => dispatch(openAppWindow({ app, title: `${title} — ${machineLabel(machineId)}`, machineId }))}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-fg hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span aria-hidden="true" className="w-5 text-center font-mono text-xs text-accent">
                {icon}
              </span>
              {title}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
