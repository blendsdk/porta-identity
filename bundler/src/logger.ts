import { ConsoleLogger } from "@blendsdk/logger";

process.env.DEBUG = "true";

export class CodeGenLogger extends ConsoleLogger {
    protected writeLog(type: string, log: any): Promise<void> {
        return new Promise((resolve) => {
            const record = `[${log.type}] ${log.message}`;
            if (type === "ERROR") {
                console.error(record);
            } else {
                console.log(record);
            }
            resolve();
        });
    }
}

export const logger = new CodeGenLogger();
