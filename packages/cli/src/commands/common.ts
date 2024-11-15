import { ensureFilePath, fileExists, joinPath, lineLogger, readFileSync, writeFileSync } from "@blendsdk/filesystem";
import { base64Decode, base64Encode } from "@blendsdk/stdlib";
import jwtDecode from "jwt-decode";

export interface ICacheStorage {
    token: string;
    host: string;
    tenant: string;
}

const cacheFile = joinPath(process.cwd(), ".porta-cli.conf");

export function saveToken(params: ICacheStorage) {
    ensureFilePath(cacheFile);
    writeFileSync(cacheFile, base64Encode(JSON.stringify(params)));
}

function getToken() {
    if (fileExists(cacheFile)) {
        const { host, tenant, token } = JSON.parse(base64Decode(readFileSync(cacheFile).toString())) as ICacheStorage;
        const { exp = 0 } = jwtDecode(token) as { exp: number };
        const now = Math.trunc(Date.now() / 1000);
        if (exp && exp > now) {
            return {
                host,
                tenant,
                token
            };
        }
    }
    return undefined;
}

export function checkGetToken() {
    const token = getToken();
    if (!token) {
        lineLogger.error('Unable to continue. Please run "porta-cli login" to authenticate first');
        process.exit(1);
    } else {
        lineLogger.info(`Using [${token.tenant}] on [${token.host}]`);
    }
    return token;
}
