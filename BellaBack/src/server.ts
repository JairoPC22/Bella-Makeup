import app from "./app";
import { env } from "./config/env";
import { runMessageRetentionJob } from "./jobs/messageRetentionJob";

app.listen(env.PORT, () => {
  console.log(`BellaBack listening on port ${env.PORT}`);

  // Los mensajes se autoeliminan tras 30 días; un setInterval simple basta
  // para esta única tarea periódica, sin necesidad de node-cron.
  void runMessageRetentionJob();
  setInterval(() => {
    void runMessageRetentionJob();
  }, 6 * 60 * 60 * 1000);
});
