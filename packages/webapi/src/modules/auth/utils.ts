import { ISysTenant } from "@porta/shared";
import * as crypto from "crypto";

export class PortaAuthUtils {
    public getKeySignature(tenant: ISysTenant, PORTA_SSO_COMMON_NAME: string) {
        return crypto.createHash("sha256").update([tenant.id, PORTA_SSO_COMMON_NAME].join("")).digest("hex");
    }
    public newAccessToken() {
        return crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
    }
    public randomSHA256() {
        return this.newAccessToken();
    }
}

export const secondsToMilliseconds = (seconds: number) => seconds * 1000;
export const expireSecondsFromNow = (seconds: number) => Date.now() + secondsToMilliseconds(seconds);

export const portaAuthUtils = new PortaAuthUtils();
