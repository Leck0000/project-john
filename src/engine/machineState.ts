import type { EngineConfig } from './types';
import { DEMO_SUBSYSTEMS } from '../app/demo';

export type ServiceStatus = 'running' | 'stopped' | 'paused' | 'error';

export interface Service {
  name: string;
  displayName: string;
  status: ServiceStatus;
  startMode: 'auto' | 'manual' | 'disabled';
}

export interface EventLogEntry {
  id: string;
  message: string;
  level: 'Info' | 'Warning' | 'Error' | 'SuccessAudit' | 'FailureAudit';
  category?: string;
  timeGenerated: string;
  eventId?: string;
}

export interface RegistryKey {
  path: string;
  value: string;
  type: 'String' | 'DWORD' | 'QWORD' | 'Binary';
}

export interface NetworkAdapter {
  name: string;
  status: 'up' | 'down';
  ip?: string;
  netmask?: string;
  mac?: string;
}

export interface AdUser {
  id: string;
  name: string;
  distinguishedName: string;
  enabled: boolean;
  whenCreated: string;
  lastLogon?: string;
}

export interface FilesystemDrive {
  letter: string;
  fsType: string;
  sizeBytes: number;
  freeBytes: number;
}

/** Every subsystem the desktop panels read, keyed by the panel's subsystem name. */
export interface Subsystems {
  services: Service[];
  'event-log': EventLogEntry[];
  registry: RegistryKey[];
  network: NetworkAdapter[];
  ad: AdUser[];
  filesystem: FilesystemDrive[];
}

export interface MachineState {
  subsystems: Subsystems;
  history: string[];
}

export function createInitialState(config: EngineConfig): MachineState {
  void config;

  return {
    subsystems: {
      services: DEMO_SUBSYSTEMS.services as Service[],
      'event-log': DEMO_SUBSYSTEMS['event-log'] as EventLogEntry[],
      registry: DEMO_SUBSYSTEMS.registry as RegistryKey[],
      network: DEMO_SUBSYSTEMS.network as NetworkAdapter[],
      ad: DEMO_SUBSYSTEMS.ad as AdUser[],
      filesystem: DEMO_SUBSYSTEMS.filesystem as FilesystemDrive[],
    },
    history: [],
  };
}