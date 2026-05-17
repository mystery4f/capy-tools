import { spawnSync } from "node:child_process";

let rtkAvailable: boolean | undefined;

export function hasRtk(): boolean {
  if (rtkAvailable !== undefined) return rtkAvailable;
  try {
    const result = spawnSync("rtk", ["--version"], { timeout: 2000, stdio: "pipe" });
    rtkAvailable = result.status === 0;
  } catch {
    rtkAvailable = false;
  }
  return rtkAvailable;
}

export function rtkRewrite(command: string): string {
  if (!hasRtk()) return command;
  try {
    const result = spawnSync("rtk", ["rewrite", command], { timeout: 2000, stdio: "pipe" });
    if (result.status !== 1 && result.stdout) {
      const rewritten = result.stdout.toString().trim();
      if (rewritten) return rewritten;
    }
  } catch {
    // fail-safe
  }
  return command;
}

export function rtkSpawnHook(context: { command: string; cwd: string; env: NodeJS.ProcessEnv }): { command: string; cwd: string; env: NodeJS.ProcessEnv } {
  return { ...context, command: rtkRewrite(context.command) };
}
