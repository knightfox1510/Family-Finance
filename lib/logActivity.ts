// lib/logActivity.ts
// Fire-and-forget activity logger for group events.
// Import and call this from API routes after successful mutations.
// Errors are swallowed — activity logging is never fatal.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export type ActivityType =
  | 'ADD_EXPENSE'
  | 'DELETE_EXPENSE'
  | 'SETTLE_DEBT'
  | 'UPDATE_SETTING'
  | 'JOIN_GROUP';

export async function logActivity(
  groupId:     string,
  userId:      string | null,
  actionType:  ActivityType,
  description: string,
  meta?:       Record<string, any>,
): Promise<void> {
  try {
    await supabase.from('group_activities').insert({
      group_id:    groupId,
      user_id:     userId,
      action_type: actionType,
      description,
      meta: meta ?? null,
    });
  } catch {
    // Non-fatal — never break the calling route
  }
}
