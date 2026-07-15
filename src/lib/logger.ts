type Meta = Record<string, unknown>;

export const logger = {
  info: (msg: string, meta?: Meta) => console.log(`[INFO] ${msg}`, meta ?? ""),
  warn: (msg: string, meta?: Meta) => console.warn(`[WARN] ${msg}`, meta ?? ""),
  error: (msg: string, meta?: Meta) => console.error(`[ERROR] ${msg}`, meta ?? ""),
  debug: (msg: string, meta?: Meta) => console.debug(`[DEBUG] ${msg}`, meta ?? ""),
};
