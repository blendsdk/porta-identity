import { eJsonSchemaType } from "@blendsdk/jsonschema";
import { ConsoleLogger } from "@blendsdk/logger";
import { WebApplication } from "@blendsdk/webafx";
import { MemoryCacheModule } from "@blendsdk/webafx-cache-memory";
import { HttpRequest, HttpResponse } from "@blendsdk/webafx-common";
import { HttpTerminator, createHttpTerminator } from "http-terminator";
import { CliSessionProvider } from "./session";
import { CliTokenAuth } from "./token";

export class DebugOnlyLogger extends ConsoleLogger {
    protected writeLog(type: string, log: any): Promise<void> {
        return new Promise((resolve) => {
            if (process.env.DEBUG_WEBSERVER) {
                const record = `[${log.type}] ${log.message}`;
                if (type === "ERROR") {
                    console.error(record);
                } else {
                    console.log(record);
                }
            }
            resolve();
        });
    }
}

export const createWebserver = ({ host, onAuthToken }: { host: string; onAuthToken: (token: string) => void }) => {
    let httpTerminator: HttpTerminator;
    let authToken: string = undefined;

    const authenticationComplete = () => {
        httpTerminator.terminate();
        onAuthToken(authToken);
    };

    const app = new WebApplication({
        settings: {
            PORT: 9090,
            CORS_WHITELIST: "*",
            HELMET_OPTIONS: {
                contentSecurityPolicy: false
            },
            PORTA_HOST: host
        },
        loggerServiceClass: DebugOnlyLogger as any
    }).addModule([
        (config) => {
            return new CliTokenAuth({ ...config }) as any;
        },
        (config) => {
            return new MemoryCacheModule({ ...config });
        },
        (config) => {
            return new CliSessionProvider({ ...config });
        }
    ]);

    app.addRouter({
        routes: [
            {
                url: "/:tenant/complete",
                method: "get",
                request: {
                    properties: {
                        tenant: {
                            type: eJsonSchemaType.string
                        }
                    }
                },
                handlers: (req: HttpRequest, res: HttpResponse) => {
                    authToken = req.context.getUser();
                    res.send(`You are authenticated with ${host} now. You can close this browser page.`);
                    authenticationComplete();
                }
            }
        ]
    });

    return async () => {
        await app.run();
        httpTerminator = createHttpTerminator({
            server: app.getServer()
        });
    };
};
