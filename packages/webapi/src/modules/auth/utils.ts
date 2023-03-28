import { encodeBase64Key } from "@blendsdk/crypto";
import { ISysTenant } from "@porta/shared";
import * as crypto from "crypto";

export enum eKeySignatureType {
    access_token = "access_token",
    refresh_token = "refresh_token"
}

export class PortaAuthUtils {
    /**
     * Creates a per tenant access token key signature
     *
     * @param {ISysTenant} tenant
     * @param {string} PORTA_SSO_COMMON_NAME
     * @returns
     * @memberof PortaAuthUtils
     */
    public getKeySignature(tenant: ISysTenant, PORTA_SSO_COMMON_NAME: string, type: eKeySignatureType) {
        return encodeBase64Key({ type, tenant: tenant.id, system: PORTA_SSO_COMMON_NAME });
    }

    public randomSHA256() {
        return crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
    }
}

/**
 * Converts seconds to milliseconds
 */
export const secondsToMilliseconds = (seconds: number) => seconds * 1000;
/**
 * Create an expire timestamp from now
 * @param seconds
 * @returns
 */
export const expireSecondsFromNow = (seconds: number) => Date.now() + secondsToMilliseconds(seconds);

/**
 * Singleton
 */
export const portaAuthUtils = new PortaAuthUtils();
