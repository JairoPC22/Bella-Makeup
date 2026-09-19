import app from "./app";
import { env } from "./config/env";
import { runMessageRetentionJob } from "./jobs/messageRetentionJob";

app.listen(env.PORT, () => {
  console.log(`BellaBack listening on port ${env.PORT}`);

  // Branch messages auto-delete after 30 days. A single periodic job is the
  // whole scheduling need here, so a plain setInterval is used instead of
  // pulling in a scheduler dependency (e.g. node-cron) for one task — that
  // would be extra surface area (and another moving part to keep patched)
  // for something a 6-hour interval already covers comfortably given the
  // 30-day retention window.
  void runMessageRetentionJob();
  setInterval(() => {
    void runMessageRetentionJob();
  }, 6 * 60 * 60 * 1000);
});
