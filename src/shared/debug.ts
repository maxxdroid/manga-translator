export const DEBUG = true;

export function log(area: string, ...args: unknown[]): void {
  if (!DEBUG) return;
  console.log(`[MT:${area}]`, ...args);
}

export function warn(area: string, ...args: unknown[]): void {
  if (!DEBUG) return;
  console.warn(`[MT:${area}]`, ...args);
}