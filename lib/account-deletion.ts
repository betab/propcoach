// lib/account-deletion.ts
// Shared by the cancel route (to compute the deletion date) and the
// Settings UI (to render copy like "your data will be permanently deleted
// in 14 days"). A plain constant, not an env var — no other tunable
// business duration in this codebase lives in one; env vars here are only
// ever secrets/credentials/URLs. Change this and redeploy if the grace
// period ever needs to differ.
export const GRACE_PERIOD_DAYS = 14

export function computeScheduledDeletionAt(from: Date = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + GRACE_PERIOD_DAYS)
  return d.toISOString()
}
