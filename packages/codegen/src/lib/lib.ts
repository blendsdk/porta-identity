import { PostgreSQLDatabase, TypeBuilder, TypeSchema } from "@blendsdk/codegen";
import { ensureFilePath } from "@blendsdk/filesystem";
import * as fs from "fs";
import * as path from "path";
import { CodeGenLogger } from "./logger";

export const consoleLogger = new CodeGenLogger();
export const typeSchema = new TypeSchema();
export const database = new PostgreSQLDatabase({ typeSchema });
export const typeBuilder = new TypeBuilder(consoleLogger);
export const projectRoot = path.resolve(process.cwd(), "..");

export function writeFileSync(fileName: string, data: string) {
    consoleLogger.info(`Writing ${fileName}`);
    ensureFilePath(fileName);
    fs.writeFileSync(fileName, data);
}
