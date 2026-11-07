/**
 * Shared utility functions for Supabase database services
 */

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return (
    Math.random().toString(36).substring(2, 12) +
    Math.random().toString(36).substring(2, 12)
  );
}

export function stripUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

export type DataChangeEvent = {
  table?: string;
  orgId?: string;
  action?: 'insert' | 'update' | 'delete' | 'recalculate';
  timestamp: number;
};

const DATA_CHANNEL_NAME = 'purit_realtime_sync';
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(DATA_CHANNEL_NAME);
  } catch (e) {
    console.warn('BroadcastChannel not supported', e);
  }
}

/**
 * Triggers a real-time data sync across the current window and all active tabs.
 * Called immediately after any mutation (create, update, delete, recalculate)
 * so React state and summary cards update with zero perception delay.
 */
export function notifyDataChanged(
  table?: string,
  orgId?: string,
  action?: 'insert' | 'update' | 'delete' | 'recalculate'
): void {
  const detail: DataChangeEvent = {
    table,
    orgId,
    action,
    timestamp: Date.now(),
  };

  if (typeof window !== 'undefined') {
    // 1. Dispatch custom event for current window
    window.dispatchEvent(new CustomEvent('purit_data_changed', { detail }));

    // 2. Broadcast across tabs
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(detail);
      } catch {
        // Ignore broadcast errors
      }
    }
  }
}

/**
 * Subscribes to real-time data changes from both local window events and cross-tab broadcasts.
 */
export function subscribeToDataChanges(
  callback: (event: DataChangeEvent) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustomEvent = (e: Event) => {
    const customEvent = e as CustomEvent<DataChangeEvent>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    }
  };

  const handleBroadcastMessage = (e: MessageEvent<DataChangeEvent>) => {
    if (e.data) {
      callback(e.data);
    }
  };

  window.addEventListener('purit_data_changed', handleCustomEvent);
  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBroadcastMessage);
  }

  return () => {
    window.removeEventListener('purit_data_changed', handleCustomEvent);
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBroadcastMessage);
    }
  };
}

