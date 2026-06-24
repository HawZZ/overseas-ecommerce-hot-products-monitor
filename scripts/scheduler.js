import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const cadenceHours = Number(process.env.REFRESH_CADENCE_HOURS || 6);
const cadenceMs = cadenceHours * 60 * 60 * 1000;

function runRefresh() {
  const startedAt = new Date().toISOString();
  console.log(`[${startedAt}] refresh started`);

  const child = spawn(process.execPath, ["scripts/update-data.js"], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });

  child.on("exit", (code) => {
    const finishedAt = new Date().toISOString();
    if (code === 0) {
      console.log(`[${finishedAt}] refresh completed`);
    } else {
      console.error(`[${finishedAt}] refresh failed with code ${code}`);
    }
  });
}

runRefresh();
setInterval(runRefresh, cadenceMs);

console.log(`Scheduler is running. Cadence: ${cadenceHours} hours.`);
