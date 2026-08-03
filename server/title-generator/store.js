import fs from "node:fs/promises";
import path from "node:path";

let writeQueue = Promise.resolve();

export function createTitleStore(dataDir) {
  const dir = path.resolve(dataDir, "title-generator");
  async function read(name, fallback) {
    try {
      return JSON.parse(await fs.readFile(path.join(dir, name), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return fallback;
      throw error;
    }
  }
  async function write(name, value) {
    writeQueue = writeQueue.then(async () => {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const target = path.join(dir, name);
      const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(temp, target);
      await fs.chmod(target, 0o600);
    });
    return writeQueue;
  }
  return { dir, read, write };
}
