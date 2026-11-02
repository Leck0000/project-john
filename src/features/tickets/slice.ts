/**
 * tickets slice — queue state mirroring ARCHITECTURE.md data models
 *
 * Consumes: ticketsApi (RTK Query), wsMiddleware (for ticket_update events), authSlice (role for technician vs instructor views)
 * Produces: ticketsSlice with queue, selectedTicket, filters, UI state + async thunks
 *
 * Strict TS: no `any`; use `unknown` + zod parsers at boundaries.
 * CSS variables for theming: --fg, --bg, --accent, --border, --card — no hardcoded colors.
 */

import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import type { RootState, AppDispatch } from '../../app/store';
import { ticketsApi } from './api';

// ---------------------------------------------------------------------------
// Zod schema for ticket update payload from WebSocket
// ---------------------------------------------------------------------------

export const TicketUpdatePayloadSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.string(),
  assigneeId: z.string().uuid().optional(),
  evidence: z.array(z.string()).optional(),
  timestamp: z.string().datetime(),
});

type TicketUpdatePayload = z.infer<typeof TicketUpdatePayloadSchema>;

// ---------------------------------------------------------------------------
// Types matching ARCHITECTURE.md §3.1 Ticket
// ---------------------------------------------------------------------------

export interface Ticket {
  id: string;
  queue: 'AD' | 'networking' | 'security' | 'helpdesk';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  state: 'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed';
  evidence: string[];
  scoring: {
    technical: number;
    process: number;
    communication: number;
  };
  requesterId: string;
  assignedTechnicianId?: string;
  relatedMachineId?: string;
  labId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketFilters {
  queue?: 'AD' | 'networking' | 'security' | 'helpdesk';
  state?: 'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignedToMe?: boolean;
  sortBy?: 'priority' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface TicketsState {
  // Queue state
  queue: Ticket[];
  selectedTicketId: string | null;

  // Filters
  filters: TicketFilters;

  // UI state
  sortBy: 'priority' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
  viewMode: 'list' | 'card';

  // Status
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: TicketsState = {
  queue: [],
  selectedTicketId: null,
  filters: {},
  sortBy: 'priority',
  sortOrder: 'desc',
  viewMode: 'card',
  status: 'idle',
  error: null,
};

// ---------------------------------------------------------------------------
// Priority ordering for sorting (critical > high > medium > low)
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<Ticket['priority'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ---------------------------------------------------------------------------
// Tickets slice
// ---------------------------------------------------------------------------

export const ticketsSlice = createSlice({
  name: 'tickets',
  initialState,
  reducers: {
    /** Set the entire queue (e.g., from initial load or WS sync) */
    setQueue: (state, action: PayloadAction<Ticket[]>) => {
      state.queue = action.payload;
      state.status = 'succeeded';
      state.error = null;
    },

    /** Add a new ticket to the queue */
    addTicket: (state, action: PayloadAction<Ticket>) => {
      const exists = state.queue.some((t: Ticket) => t.id === action.payload.id);
      if (!exists) {
        state.queue.push(action.payload);
      }
    },

    /** Update a ticket in the queue */
    updateTicketInQueue: (state, action: PayloadAction<Partial<Ticket> & { id: string }>) => {
      const index = state.queue.findIndex((t: Ticket) => t.id === action.payload.id);
      if (index !== -1) {
        state.queue[index] = { ...state.queue[index], ...action.payload } as Ticket;
      }
    },

    /** Remove a ticket from the queue */
    removeTicket: (state, action: PayloadAction<string>) => {
      state.queue = state.queue.filter((t: Ticket) => t.id !== action.payload);
      if (state.selectedTicketId === action.payload) {
        state.selectedTicketId = null;
      }
    },

    /** Select a ticket for detail view */
    selectTicket: (state, action: PayloadAction<string | null>) => {
      state.selectedTicketId = action.payload;
    },

    /** Set filters */
    setFilters: (state, action: PayloadAction<Partial<TicketFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },

    /** Clear all filters */
    clearFilters: (state) => {
      state.filters = {};
    },

    /** Set sort configuration */
    setSort: (state, action: PayloadAction<{ sortBy?: TicketsState['sortBy']; sortOrder?: TicketsState['sortOrder'] }>) => {
      if (action.payload.sortBy) state.sortBy = action.payload.sortBy;
      if (action.payload.sortOrder) state.sortOrder = action.payload.sortOrder;
    },

    /** Set view mode (list or card) */
    setViewMode: (state, action: PayloadAction<TicketsState['viewMode']>) => {
      state.viewMode = action.payload;
    },

    /** Set loading status */
    setStatus: (state, action: PayloadAction<TicketsState['status']>) => {
      state.status = action.payload;
    },

    /** Set error message */
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      if (action.payload) state.status = 'failed';
    },

    /** Clear error */
    clearError: (state) => {
      state.error = null;
      if (state.status === 'failed') state.status = 'idle';
    },

    /** Merge ticket from WebSocket ticket_update event */
        mergeTicketUpdate: (state, action: PayloadAction<TicketUpdatePayload>) => {
      const { ticketId, status, assigneeId, timestamp, evidence } = action.payload;
      const index = state.queue.findIndex((t: Ticket) => t.id === ticketId);
      if (index !== -1) {
        const ticket = state.queue[index]!;
        state.queue[index] = {
          ...ticket,
          state: status as Ticket['state'],
          assignedTechnicianId: assigneeId ?? ticket.assignedTechnicianId,
          updatedAt: timestamp,
          evidence: evidence ? [...ticket.evidence, ...evidence] : ticket.evidence,
        };
      }
    },
  },
});

// ---------------------------------------------------------------------------
// Async thunks that coordinate with ticketsApi and WS
// ---------------------------------------------------------------------------

/** Fetch tickets with current filters */
export const fetchTickets = (params?: { queue?: Ticket['queue']; state?: Ticket['state']; priority?: Ticket['priority']; assignedToMe?: boolean }) =>
  async (dispatch: AppDispatch) => {
    dispatch(ticketsSlice.actions.setStatus('loading'));
    try {
      const result = await dispatch(
        ticketsApi.endpoints.listTickets.initiate(params ?? {})
      ).unwrap();
      dispatch(ticketsSlice.actions.setQueue(result.tickets));
    } catch (error) {
      dispatch(ticketsSlice.actions.setError(error instanceof Error ? error.message : 'Failed to fetch tickets'));
    }
  };

/** Claim a ticket for the current technician */
export const claimTicket = (ticketId: string) => async (dispatch: AppDispatch) => {
  const result = await dispatch(ticketsApi.endpoints.claimTicket.initiate({ ticketId })).unwrap();
  // The server confirms via a ticket_update WS event; update optimistically meanwhile.
  dispatch(ticketsSlice.actions.updateTicketInQueue({ id: ticketId, state: 'in_progress' }));
  return result;
};


// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const selectQueue = (state: RootState) => state.tickets.queue;
const selectFilters = (state: RootState) => state.tickets.filters;
const selectSortBy = (state: RootState) => state.tickets.sortBy;
const selectSortOrder = (state: RootState) => state.tickets.sortOrder;
const selectCurrentUserId = (state: RootState) => state.auth.user?.id;

/** Get filtered and sorted queue (memoized; never mutates store state) */
export const selectFilteredQueue = createSelector(
  [selectQueue, selectFilters, selectSortBy, selectSortOrder, selectCurrentUserId],
  (queue, filters, sortBy, sortOrder, userId): Ticket[] => {
    const filtered = queue.filter(
      (t) =>
        (!filters.queue || t.queue === filters.queue) &&
        (!filters.state || t.state === filters.state) &&
        (!filters.priority || t.priority === filters.priority) &&
        (!filters.assignedToMe || !userId || t.assignedTechnicianId === userId)
    );
    // Ascending comparison; 'desc' (default) puts critical / newest first.
    const compare = (a: Ticket, b: Ticket): number => {
      switch (sortBy) {
        case 'priority':
          return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        case 'createdAt':
          return Date.parse(a.createdAt) - Date.parse(b.createdAt);
        case 'updatedAt':
          return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
      }
    };
    return filtered.sort((a, b) => (sortOrder === 'asc' ? compare(a, b) : compare(b, a)));
  }
);

/** Get selected ticket */
export const selectSelectedTicket = (state: RootState): Ticket | null => {
  const { queue, selectedTicketId } = state.tickets;
  if (!selectedTicketId) return null;
  return queue.find((t) => t.id === selectedTicketId) ?? null;
};

const countBy = <K extends string>(queue: Ticket[], keys: readonly K[], key: (t: Ticket) => K): Record<K, number> => {
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const t of queue) counts[key(t)] += 1;
  return counts;
};

/** Get queue count by state */
export const selectQueueCounts = createSelector([selectQueue], (queue) =>
  countBy(queue, ['open', 'in_progress', 'on_hold', 'resolved', 'closed'] as const, (t) => t.state)
);

/** Get queue count by priority */
export const selectPriorityCounts = createSelector([selectQueue], (queue) =>
  countBy(queue, ['critical', 'high', 'medium', 'low'] as const, (t) => t.priority)
);

/** Get queue count by queue */
export const selectQueueTypeCounts = createSelector([selectQueue], (queue) =>
  countBy(queue, ['AD', 'networking', 'security', 'helpdesk'] as const, (t) => t.queue)
);

// ---------------------------------------------------------------------------
// Action exports
// ---------------------------------------------------------------------------

export const {
  setQueue,
  addTicket,
  updateTicketInQueue,
  removeTicket,
  selectTicket,
  setFilters,
  clearFilters,
  setSort,
  setViewMode,
  setStatus,
  setError,
  clearError,
  mergeTicketUpdate,
} = ticketsSlice.actions;

export default ticketsSlice.reducer;