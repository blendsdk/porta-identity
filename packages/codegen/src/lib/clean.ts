import * as fs from "fs";
import * as path from "path";
import { consoleLogger, projectRoot } from "./lib";
import { globSync } from "@blendsdk/filesystem";

/**
 * Delete existing generated files
 *
 * @export
 */
export function clean_generated() {
    const folder = path.resolve(projectRoot, "**", "generated_*");
    const files = globSync(folder);
    files.forEach((f) => {
        consoleLogger.info(`Deleting ${f.replace(projectRoot, "")}`);
        fs.unlinkSync(f);
    });
}
