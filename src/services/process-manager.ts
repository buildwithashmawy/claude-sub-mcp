import { ChildProcess } from "node:child_process";

const activeProcesses = new Set<ChildProcess>();

export function trackProcess(proc: ChildProcess): void {
  activeProcesses.add(proc);
  proc.on("exit", () => {
    activeProcesses.delete(proc);
  });
  proc.on("error", () => {
    activeProcesses.delete(proc);
  });
}

export function killProcess(proc: ChildProcess): void {
  if (!proc.killed) {
    proc.kill("SIGTERM");
    // Force kill after 5s if SIGTERM didn't work
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill("SIGKILL");
      }
    }, 5000);
  }
}

export function cleanupAllProcesses(): void {
  for (const proc of activeProcesses) {
    killProcess(proc);
  }
  activeProcesses.clear();
}

export function getActiveProcessCount(): number {
  return activeProcesses.size;
}
