/**
 * Demo mode — seeds sample tickets so the UI can be explored without a
 * backend. Opt-in only: add `?demo=1` to the URL or build with VITE_DEMO=1.
 * Nothing here runs against a real server.
 */
import type { Ticket } from '../features/tickets/slice';
import type { CohortStudent, LabProgress } from '../features/team/api';

export function isDemoMode(search: string = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  return new URLSearchParams(search).get('demo') === '1' || import.meta.env.VITE_DEMO === '1';
}

/** Non-demo fallback machine when no ticket is selected. */
export const LAB_DEFAULT_MACHINE_ID = 'lab-ws01';

export interface DemoMachine {
  id: string;
  hostname: string;
}

/** Demo machines: UUID ids (strict schemas) with human-readable hostnames. */
export const DEMO_MACHINES: readonly DemoMachine[] = [
  { id: '3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b01', hostname: 'ws-finance-07' },
  { id: '3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b02', hostname: 'ws-ops-12' },
  { id: '3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b03', hostname: 'ws-hr-02' },
  { id: '3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b04', hostname: 'lt-sales-31' },
  { id: '3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b05', hostname: 'ws-finance-03' },
];

const machineIdFor = (hostname: string): string => {
  const machine = DEMO_MACHINES.find((m) => m.hostname === hostname);
  if (!machine) throw new Error(`unknown demo machine ${hostname}`);
  return machine.id;
};

/** Machine the Print Spooler ticket is about (ws-hr-02). */
const SPOOLER_MACHINE_ID = machineIdFor('ws-hr-02');

/** What a human sees for a machine: its hostname if known, else the raw id. */
export function machineLabel(machineId: string): string {
  return DEMO_MACHINES.find((m) => m.id === machineId)?.hostname ?? machineId;
}

/** Machine used when no ticket is selected: the Spooler ticket's machine in demo mode, else the lab default. */
export function defaultMachineId(search: string = typeof window !== 'undefined' ? window.location.search : ''): string {
  return isDemoMode(search) ? SPOOLER_MACHINE_ID : LAB_DEFAULT_MACHINE_ID;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const ticket = (
  id: string,
  fields: Pick<Ticket, 'queue' | 'priority' | 'state' | 'category' | 'relatedMachineId'> & { age: number }
): Ticket => ({
  id,
  queue: fields.queue,
  priority: fields.priority,
  state: fields.state,
  category: fields.category,
  relatedMachineId: fields.relatedMachineId,
  evidence: [],
  scoring: { technical: 0, process: 0, communication: 0 },
  requesterId: '8a4d2c1b-6e5f-4a3b-9c8d-7e6f5a4b3c01',
  createdAt: hoursAgo(fields.age),
  updatedAt: hoursAgo(fields.age / 2),
});

export const DEMO_TICKETS: Ticket[] = [
  ticket('5b0f6c1e-2d4a-4c8e-9f11-0a1b2c3d4e01', {
    queue: 'AD', priority: 'critical', state: 'open', age: 1,
    category: 'User locked out after password reset', relatedMachineId: machineIdFor('ws-finance-07'),
  }),
  ticket('5b0f6c1e-2d4a-4c8e-9f11-0a1b2c3d4e02', {
    queue: 'networking', priority: 'high', state: 'open', age: 3,
    category: 'No network access on 3rd floor — APIPA address', relatedMachineId: machineIdFor('ws-ops-12'),
  }),
  ticket('5b0f6c1e-2d4a-4c8e-9f11-0a1b2c3d4e03', {
    queue: 'helpdesk', priority: 'medium', state: 'in_progress', age: 6,
    category: 'Print spooler keeps stopping', relatedMachineId: machineIdFor('ws-hr-02'),
  }),
  ticket('5b0f6c1e-2d4a-4c8e-9f11-0a1b2c3d4e04', {
    queue: 'security', priority: 'high', state: 'open', age: 9,
    category: 'Suspicious scheduled task found on laptop', relatedMachineId: machineIdFor('lt-sales-31'),
  }),
  ticket('5b0f6c1e-2d4a-4c8e-9f11-0a1b2c3d4e05', {
    queue: 'helpdesk', priority: 'low', state: 'resolved', age: 30,
    category: 'Mapped drive missing after login', relatedMachineId: machineIdFor('ws-finance-03'),
  }),
];

/** Sample subsystem snapshots, applied as if the server sent ws state.delta. */
export const DEMO_SUBSYSTEMS: Record<string, unknown> = {
  services: [
    { name: 'Spooler', displayName: 'Print Spooler', status: 'stopped', startMode: 'auto' },
    { name: 'Dhcp', displayName: 'DHCP Client', status: 'running', startMode: 'auto' },
    { name: 'Dnscache', displayName: 'DNS Client', status: 'running', startMode: 'auto' },
    { name: 'LanmanWorkstation', displayName: 'Workstation', status: 'running', startMode: 'auto' },
    { name: 'wuauserv', displayName: 'Windows Update', status: 'paused', startMode: 'manual' },
    { name: 'W32Time', displayName: 'Windows Time', status: 'error', startMode: 'manual' },
  ],
  'event-log': [
    {
      id: '7c1e2d3f-4a5b-4c6d-8e7f-001122334401',
      level: 'Error',
      message: 'The Print Spooler service terminated unexpectedly.',
      timeGenerated: hoursAgo(1),
      eventId: '7034',
    },
    {
      id: '7c1e2d3f-4a5b-4c6d-8e7f-001122334402',
      level: 'Warning',
      message: 'Name resolution for the name wpad timed out.',
      timeGenerated: hoursAgo(2),
      eventId: '1014',
    },
  ],
  registry: [
    { path: String.raw`HKLM\SYSTEM\CurrentControlSet\Services\Spooler\Start`, value: '2', type: 'DWORD' },
    { path: String.raw`HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU\NoAutoUpdate`, value: '1', type: 'DWORD' },
    { path: String.raw`HKCU\Network\S\RemotePath`, value: String.raw`\\fs01\shared`, type: 'String' },
  ],
  network: [
    { name: 'Ethernet0', status: 'up', ip: '169.254.12.40', netmask: '255.255.0.0', mac: '00-15-5D-01-02-03' },
    { name: 'Wi-Fi', status: 'down', mac: '00-15-5D-01-02-04' },
  ],
  ad: [
    {
      id: '5f0b6a2e-1c3d-4e5f-8a9b-00112233aa01',
      name: 'Dana Whitfield',
      distinguishedName: 'CN=Dana Whitfield,OU=Finance,DC=corp,DC=example',
      enabled: false,
      whenCreated: '2025-03-14T09:00:00Z',
      lastLogon: hoursAgo(26),
    },
    {
      id: '5f0b6a2e-1c3d-4e5f-8a9b-00112233aa02',
      name: 'Sam Ortiz',
      distinguishedName: 'CN=Sam Ortiz,OU=IT,DC=corp,DC=example',
      enabled: true,
      whenCreated: '2024-11-02T09:00:00Z',
      lastLogon: hoursAgo(1),
    },
  ],
  filesystem: [
    { letter: 'C', fsType: 'NTFS', sizeBytes: 255_000_000_000, freeBytes: 3_100_000_000 },
    { letter: 'D', fsType: 'NTFS', sizeBytes: 1_000_000_000_000, freeBytes: 640_000_000_000 },
  ],
};

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const DEMO_LAB_ID = '9d8c7b6a-5f4e-4d3c-8b2a-19f8e7d6c501';

const student = (
  n: number,
  name: string,
  fields: Pick<CohortStudent, 'progress' | 'status'> & { activeMinutesAgo: number }
): CohortStudent => ({
  id: `2a6f0c4e-8b1d-4f3a-9c5e-7d2b1a0f3e${String(n).padStart(2, '0')}`,
  name,
  role: 'technician',
  labId: DEMO_LAB_ID,
  progress: fields.progress,
  status: fields.status,
  lastActive: minutesAgo(fields.activeMinutesAgo),
});

/** Sample cohort roster for Team mode (shape of GET /team/cohort). */
export const DEMO_COHORT: CohortStudent[] = [
  student(1, 'Aisha Rahman', { progress: 100, status: 'complete', activeMinutesAgo: 2 }),
  student(2, 'Ben Carter', { progress: 72, status: 'running', activeMinutesAgo: 1 }),
  student(3, 'Chen Wei', { progress: 45, status: 'running', activeMinutesAgo: 3 }),
  student(4, 'Daniela Souza', { progress: 30, status: 'error', activeMinutesAgo: 4 }),
  student(5, 'Elias Novak', { progress: 10, status: 'idle', activeMinutesAgo: 25 }),
  student(6, 'Farah Ismail', { progress: 88, status: 'running', activeMinutesAgo: 1 }),
];

/** Sample lab_progress stream (shape of GET /team/lab-progress), oldest first. */
export const DEMO_LAB_PROGRESS: LabProgress[] = [12, 20, 31, 38, 47, 55, 61, 69].map((progress, i, all) => ({
  labId: DEMO_LAB_ID,
  progress,
  activeMachines: 4 + (i % 3),
  timestamp: minutesAgo((all.length - i) * 3),
}));
