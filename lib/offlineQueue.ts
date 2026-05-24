// ─── lib/offlineQueue.ts ──────────────────────────────────────────────────────
// Persists expenses to localStorage when offline so they can be synced later.
// The queue is flushed automatically when the browser comes back online
// (handled in page.tsx via the window 'online' event listener).

const QUEUE_KEY = 'ff_offline_queue';

export interface QueuedExpense {
  id: string;         // temp UUID — replaced by real DB id on sync
  queuedAt: string;   // ISO timestamp
  [key: string]: any; // all expense fields
}

export function getQueue(): QueuedExpense[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addToQueue(expense: Omit<QueuedExpense, 'queuedAt'>): void {
  const queue = getQueue();
  queue.push({ ...expense, queuedAt: new Date().toISOString() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue(): void {
  localStorage.setItem(QUEUE_KEY, '[]');
}

export function queueSize(): number {
  return getQueue().length;
}
