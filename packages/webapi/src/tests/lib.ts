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

export const getTokenEndpoint = (tenant?: string) => {
    return `${BASE_URL}/${tenant || "default"}/oauth2/token`;
};

export async function constCreateClient(tenantName: string) {
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

export const authenticateUser = (auth?: { username?: string; password?: string }) => {
    return (options: Record<string, any>, responseDetails: { headers: Record<string, string> }) => {
        options.withCredentials = true;
        options.headers = options.headers || {};
        options.headers["Cookie"] = ((responseDetails?.headers["set-cookie"] as any) || []).join(";");
        options.headers.signin = Buffer.from(JSON.stringify(auth || {})).toString("base64");
    };
};

export function initTestTenant(tenantName: string) {
    return databaseUtils.initializeTenant(tenantName, tenantName, "test org", true, true, "admin", "secret");
}

export function cleanTestTenant(tenantName: string) {
    return databaseUtils.deleteTenant(tenantName);
}
