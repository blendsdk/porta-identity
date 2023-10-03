import { lineLogger } from "@blendsdk/filesystem";
import { spawnSync } from "child_process";
import { CommandModule } from "yargs";
import { saveToken } from "../common";
import { createWebserver } from "./webserver/webserver";

export function createLoginCommand(): CommandModule {
    return {
        command: "login",
        describe: "Login to PortaIdentity",
        builder: {
            h: {
                alias: "host",
                requiresArg: true,
                type: "string",
                default: "https://dev.portaidentity.com"
            },
            t: {
                alias: "tenant",
                requiresArg: true,
                type: "string",
                default: "registry"
            }
        },
        handler: ({ host, tenant }) => {
            const webserver = createWebserver({
                host: host as any,
                onAuthToken: (storage: any) => {
                    saveToken({
                        token: storage.tokenSet.access_token,
                        host: host.toString(),
                        tenant: tenant.toString()
                    });
                    lineLogger.info("Authentication complete.");
                }
            });
            webserver().then(() => {
                spawnSync("open", [`http://localhost:9090/oidc/${tenant}/signin`]);
            });
        }
    };
}
