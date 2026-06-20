type Fields = Record<string, unknown>;

function fmt(fields?: Fields): string {
  if (!fields) return '';
  return (
    ' ' +
    Object.entries(fields)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ')
  );
}

/**
 * Minimal structured logger for server-side pipelines. Emits greppable lines of
 * the form `<ISO timestamp> [scope] LEVEL message key=value …` to the server
 * console (visible in `next dev` output / production server logs).
 */
export function createLogger(scope: string) {
  const line = (level: string, msg: string, fields?: Fields) =>
    `${new Date().toISOString()} [${scope}] ${level} ${msg}${fmt(fields)}`;
  return {
    info: (msg: string, fields?: Fields) => console.log(line('INFO', msg, fields)),
    warn: (msg: string, fields?: Fields) => console.warn(line('WARN', msg, fields)),
    error: (msg: string, fields?: Fields) => console.error(line('ERROR', msg, fields)),
  };
}
