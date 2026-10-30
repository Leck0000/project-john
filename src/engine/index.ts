/**
 * Engine registry — holds the one SimEngine that lives for the whole page.
 * To use your own engine, change the factory below.
 */
import { DEMO_TICKETS } from '../app/demo';
import { createStubEngine } from './stubEngine';
import type { CreateEngine, EngineConfig, SimEngine } from './types';

const createEngine: CreateEngine = createStubEngine;

let current: SimEngine | null = null;

function demoConfig(): EngineConfig {
  return { machines: [], tickets: DEMO_TICKETS };
}

/** Returns the page's engine, creating it from the demo config on first use. */
export function getEngine(): SimEngine {
  if (current === null) {
    current = createEngine(demoConfig());
  }
  return current;
}

/** Replaces the page's engine (tests / swapping). `null` means: recreate lazily on the next `getEngine()`. */
export function setEngine(engine: SimEngine | null): void {
  current = engine;
}
