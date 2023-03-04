import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import { consoleLogger, projectRoot } from "./lib";

/**
 * Delete existing generated files
 *
 * @export
 */
export function clean_generated() {
    const folder = path.resolve(projectRoot, "**", "generated_*");
    const files = glob.sync(folder);
    files.forEach((f) => {
        consoleLogger.info(`Deleting ${f.replace(projectRoot, "")}`);
        fs.unlinkSync(f);
    });
}
