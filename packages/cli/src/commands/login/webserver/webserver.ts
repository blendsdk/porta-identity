import { eJsonSchemaType } from "@blendsdk/jsonschema";
import { Application, ConsoleLoggerService } from "@blendsdk/webafx";
import { MemoryCacheModule } from "@blendsdk/webafx-cache-memory";
import { HttpRequest, HttpResponse } from "@blendsdk/webafx-common";
import { HttpTerminator, createHttpTerminator } from "http-terminator";
import { CliSessionProvider } from "./session";
import { CliTokenAuth } from "./token";

export const createWebserver = ({ host, onAuthToken }: { host: string; onAuthToken: (token: string) => void }) => {
    let httpTerminator: HttpTerminator;
    let authToken: string = undefined;

    const authenticationComplete = () => {
        httpTerminator.terminate();
        onAuthToken(authToken);
    };

    const app = new Application({
        settings: {
            PORT: 9090,
            CORS_WHITELIST: "*",
            HELMET_OPTIONS: {
                contentSecurityPolicy: false
            },
            PORTA_HOST: host
        },
        loggerServiceClass: ConsoleLoggerService
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
        const server = await app.run();
        httpTerminator = createHttpTerminator({
            server
        });
    };
};
