import {
  debug as pluginDebug,
  error as pluginError,
  info as pluginInfo,
  warn as pluginWarn,
} from "@tauri-apps/plugin-log";

function format(args: unknown[]): string {
  return args
    .map((arg) =>
      arg instanceof Error
        ? (arg.stack ?? arg.message)
        : typeof arg === "string"
          ? arg
          : JSON.stringify(arg),
    )
    .join(" ");
}

/**
 * Unified logging backed by the Tauri log plugin. Every module logs through
 * this wrapper so output is consistent and the level can be tuned centrally.
 * `format` coerces non-string values (including Errors) into a readable line.
 */
export const log = {
  debug: (...args: unknown[]) => pluginDebug(format(args)),
  info: (...args: unknown[]) => pluginInfo(format(args)),
  warn: (...args: unknown[]) => pluginWarn(format(args)),
  error: (...args: unknown[]) => pluginError(format(args)),
};