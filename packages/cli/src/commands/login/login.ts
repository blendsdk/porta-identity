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
                required: true,
                type: "string"
            },
            t: {
                alias: "tenant",
                required: true,
                type: "string"
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
