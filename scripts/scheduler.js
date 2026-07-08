import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const cadenceHours = Number(process.env.REFRESH_CADENCE_HOURS || 24);
const cadenceMs = cadenceHours * 60 * 60 * 1000;
const skipCollect = process.env.SKIP_COLLECT === "true";

function runScript(scriptPath, label) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    console.log(`[${startedAt}] ${label} started`);

    const child = spawn(process.execPath, [scriptPath], {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env
    });

    child.on("exit", (code) => {
      const finishedAt = new Date().toISOString();
      if (code === 0) {
        console.log(`[${finishedAt}] ${label} completed`);
        resolve(true);
      } else {
        console.error(`[${finishedAt}] ${label} failed with code ${code}`);
        resolve(false);
      }
    });
  });
}

async function runCycle() {
  const startedAt = new Date().toISOString();
  console.log(`\n[${startedAt}] === 定时任务开始 ===`);

  if (!skipCollect) {
    const collectOk = await runScript("scripts/collectors/index.js", "collect");
    if (!collectOk) {
      console.warn("[collect] 采集失败，继续用已有数据刷新快照");
    }
  }

  await runScript("scripts/update-data.js", "refresh");
  console.log(`[${new Date().toISOString()}] === 定时任务结束 ===\n`);
}

runCycle();
setInterval(runCycle, cadenceMs);

console.log(`Scheduler is running. Cadence: ${cadenceHours} hours.`);
