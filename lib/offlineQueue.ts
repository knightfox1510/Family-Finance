// ─── lib/offlineQueue.ts ──────────────────────────────────────────────────────
// Persists expenses to localStorage when offline so they can be synced later.
// The queue is flushed automatically when the browser comes back online
// (handled in page.tsx via the window 'online' event listener).

const QUEUE_KEY = 'ff_offline_queue';

export interface QueuedExpense {
  id: string;
  queuedAt: string;
  [key: string]: any;
}

export function getQueue(): QueuedExpense[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

// Accept any object with at least an id — queuedAt is added here
export function addToQueue(expense: { id: string; [key: string]: any }): void {
  const queue = getQueue();
  const entry: QueuedExpense = { ...expense, queuedAt: new Date().toISOString() };
  queue.push(entry);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue(): void {
  localStorage.setItem(QUEUE_KEY, '[]');
}

export function queueSize(): number {
  return getQueue().length;
}
