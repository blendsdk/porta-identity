/// <reference types="node" />
import { SpawnOptions } from "bun";
import * as fs from "fs";
/**
 * Wrapper around Bun.spawnSync
 */
export declare function executeCommand<Opts extends SpawnOptions.OptionsObject>(options: Opts & {
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
}): {
    success: any;
    error: any;
    output: any;
};
/**
 * Check if a file exists
 *
 * @export
 * @param {string} filePath
 * @returns
 */
export declare function fileExists(filePath: string): fs.Stats;
