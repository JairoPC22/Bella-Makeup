import { deleteExpiredMessages } from "../services/messageService";

// Wraps messageService.deleteExpiredMessages() so a failed cleanup run is
// logged but never crashes the process or blocks the next scheduled run.
export async function runMessageRetentionJob(): Promise<void> {
  try {
    const count = await deleteExpiredMessages();
    if (count > 0) {
      console.log(`[messageRetention] deleted ${count} message(s) older than 30 days`);
    }
  } catch (err) {
    console.error("[messageRetention] cleanup run failed:", err);
  }
}
