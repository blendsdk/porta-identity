import { sha256Hash } from "@blendsdk/crypto";
import { base64Decode, base64Encode } from "@blendsdk/stdlib";
import { databaseUtils } from "../utils";

jest.setTimeout(60000);

export const BASE_URL = `http://localhost:4010`;

export const adminUser = {
    username: "admin",
    password: "secret"
};

export const getAuthEndpoint = (tenant?: string) => {
    return `${BASE_URL}/${tenant}/oauth2/authorize`;
};

export async function createClient(tenantName: string) {
    const tenant = await databaseUtils.findTenant(tenantName);
    return databaseUtils.createClient(
        null,
        {
            client_id: undefined,
            redirect_uri: "http://localhost:4020/callback"
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
