const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

function write(level, message, meta) {
  if ((level === "debug" || level === "info") && (isProduction || isTest)) {
    return;
  }

  const safeMeta = meta && Object.keys(meta).length ? meta : undefined;
  const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
  console[method](`[${level.toUpperCase()}] ${message}`, safeMeta || "");
}

export const logger = {
  debug(message, meta) {
    write("debug", message, meta);
  },
  info(message, meta) {
    write("info", message, meta);
  },
  warn(message, meta) {
    write("warn", message, meta);
  },
  error(message, meta) {
    write("error", message, meta);
  },
};
