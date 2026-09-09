/**
 * Jory logger
 * - Server: pino with LOG_LEVEL env var
 * - Client: console shim gated by NEXT_PUBLIC_LOG_LEVEL
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// -----------------------------------------------------------------------
// Client logger
// -----------------------------------------------------------------------

function clientLogger(ns: string) {
  const envLevel =
    (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel | undefined) ??
    (process.env.NODE_ENV === "development" ? "debug" : "warn");

  const threshold = LEVEL_ORDER[envLevel] ?? LEVEL_ORDER.warn;

  function log(level: LogLevel, ...args: unknown[]) {
    if (LEVEL_ORDER[level] < threshold) return;
    const prefix = `[${ns}]`;
    switch (level) {
      case "debug":
        console.debug(prefix, ...args);
        break;
      case "info":
        console.info(prefix, ...args);
        break;
      case "warn":
        console.warn(prefix, ...args);
        break;
      case "error":
        console.error(prefix, ...args);
        break;
    }
  }

  return {
    debug: (...args: unknown[]) => log("debug", ...args),
    info: (...args: unknown[]) => log("info", ...args),
    warn: (...args: unknown[]) => log("warn", ...args),
    error: (...args: unknown[]) => log("error", ...args),
  };
}

// -----------------------------------------------------------------------
// Server logger (pino)
// -----------------------------------------------------------------------

type PinoLogger = {
  child: (bindings: Record<string, unknown>) => PinoLogger;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

function makeServerLogger(): PinoLogger {
  // Dynamic require so bundler doesn't include pino on client
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require("pino") as (opts: object) => PinoLogger;
  return pino({ level: process.env.LOG_LEVEL ?? "info" });
}

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

type ChildLogger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

let _serverLogger: PinoLogger | null = null;

function getServerLogger(): PinoLogger {
  if (!_serverLogger) {
    _serverLogger = makeServerLogger();
  }
  return _serverLogger;
}

/**
 * Returns a namespaced child logger.
 * On server: pino child logger.
 * On client: console shim with level gating.
 */
export function createLogger(ns: string): ChildLogger {
  if (typeof window === "undefined") {
    const child = getServerLogger().child({ ns });
    return {
      debug: (msg, ...args) => child.debug({ ...args }, String(msg)),
      info: (msg, ...args) => child.info({ ...args }, String(msg)),
      warn: (msg, ...args) => child.warn({ ...args }, String(msg)),
      error: (msg, ...args) => child.error({ ...args }, String(msg)),
    };
  }
  return clientLogger(ns);
}

export const logger = createLogger("app");
