import { SpawnOptions } from "bun";
import { logger } from "./logger";
import * as fs from "fs";

/**
 * Wrapper around Bun.spawnSync
 */
export function executeCommand<Opts extends SpawnOptions.OptionsObject>(
    options: Opts & {
        /**
         * The command to run
         *
         * The first argument will be resolved to an absolute executable path. It must be a file, not a directory.
         *
         * If you explicitly set `PATH` in `env`, that `PATH` will be used to resolve the executable instead of the default `PATH`.
         *
         * To check if the command exists before running it, use `Bun.which(bin)`.
         *
         * @example
         * ```ts
         * const subprocess = Bun.spawnSync({ cmd: ["echo", "hello"] });
         * ```
         */
        cmd: string[];
        exitOnError?: boolean;
        debug?: boolean;
    }
) {
    if (options.debug) {
        logger.debug(options.cmd.join(" "));
    }
    const exitOnError = options.exitOnError || true;
    const { success, stderr, stdout } = Bun.spawnSync(options);
    const error = stderr.toString();
    const output = stdout.toString();
    if (options.debug) {
        (output || "").split("\n").forEach((l) => logger.info(l));
        (error || "").split("\n").forEach((l) => logger.error(l));
    }
    if (!success && error) {
        output.split("\n").forEach((l) => logger.info(l));
        error.split("\n").forEach((l) => logger.error(l));
        if (exitOnError) {
            process.exit(1);
        }
    }
    return {
        success,
        error,
        output
    };
}

/**
 * Check if a file exists
 *
 * @export
 * @param {string} filePath
 * @returns
 */
export function fileExists(filePath: string) {
    return fs.statSync(filePath, { throwIfNoEntry: false });
}
