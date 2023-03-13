import { sha256Hash } from "@blendsdk/crypto";
import { base64Decode, base64Encode } from "@blendsdk/stdlib";
import { application } from "../modules/application";
import { checkAndInitialize } from "../modules/commandline/commands/start";
import { eClientType } from "../types";
import { databaseUtils } from "../utils";
import { PortaApi } from "./api";
import { start_local_server, stop_local_server } from "./local_test_client";

jest.setTimeout(60000);

export const BASE_URL = `http://localhost:4010`;

export const adminUser = {
    username: "admin",
    password: "secret"
};

export const getAuthEndpoint = (tenant?: string) => {
    return `${BASE_URL}/${tenant}/oauth2/authorize`;
};

export async function createClient(tenantName: string, clientType?: eClientType, redirect_uri?: string) {
    const tenant = await databaseUtils.findTenant(tenantName);
    return databaseUtils.createClient(
        {
            redirect_uri: redirect_uri === null ? undefined : "http://localhost:4020/callback",
            client_type: clientType || eClientType.confidential,
            application_name: "Jest",
            client_id: null
        },
        tenant
    );
}

export const makeState = (data: any) => {
    return base64Encode(JSON.stringify(data));
};

export const parseState = <T = any>(data: any) => {
    return (data ? JSON.parse(base64Decode(data)) : {}) as T;
};

export function initTestTenant(tenantName: string) {
    return databaseUtils.initializeTenant(tenantName, tenantName, "test org", true, true, "admin", "secret");
}

export function cleanTestTenant(tenantName: string) {
    return databaseUtils.deleteTenant(tenantName);
}

export function createCodeVerifier(str: string) {
    return base64Encode(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function createCodeChallenge(verifier: string) {
    return sha256Hash(verifier, "base64url");
}

export function create_before_all(test_set: string) {
    return async function () {
        const startClientServer = new Promise<void>((resolve) => {
            start_local_server(() => {
                resolve();
            });
        });
        await startClientServer;
        await application.run().then(async () => {
            PortaApi.setBaseUrl(BASE_URL);
        });
        await checkAndInitialize();
        await cleanTestTenant(test_set);
        await initTestTenant(test_set);
        await databaseUtils.initializeTenantDataSource(test_set);
    };
}

export function create_after_all() {
    return async () => {
        const stopClientServer = new Promise<void>((resolve) => {
            stop_local_server(() => {
                resolve();
            });
        });

        try {
            await stopClientServer;
            await application.stop();
        } catch (err) {
            console.error({ err });
        }
    };
}
