import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../node_modules/electron-vite/bin/electron-vite.js", import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && !key.startsWith("=")));
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
