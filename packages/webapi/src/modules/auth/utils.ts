import { encodeBase64Key } from "@blendsdk/crypto";
import { ISysTenant } from "@porta/shared";
import * as crypto from "crypto";

export class PortaAuthUtils {
    /**
     * Creates a per tenant access token key signature
     *
     * @param {ISysTenant} tenant
     * @param {string} PORTA_SSO_COMMON_NAME
     * @returns
     * @memberof PortaAuthUtils
     */
    public getKeySignature(tenant: ISysTenant, PORTA_SSO_COMMON_NAME: string) {
        return encodeBase64Key({ type: "access_token", tenant: tenant.id, system: PORTA_SSO_COMMON_NAME });
    }

    /**
     * Create a new access token
     *
     * @returns
     * @memberof PortaAuthUtils
     */
    public newAccessToken() {
        return crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
    }
    public randomSHA256() {
        return this.newAccessToken();
    }

    /**
     * Create an access token cache key
     *
     * @param {string} tenant
     * @param {string} accessToken
     * @returns
     * @memberof PortaAuthUtils
     */
    public getAccessTokenCacheKey(tenant: string, accessToken: string) {
        return [tenant, "access_tokens", accessToken].join(":");
    }

    /**
     * Check if a given time has expired
     *
     * @param {Number} timeStamp
     * @returns
     * @memberof EndpointController
     */
    public isTimeExpired(timeStamp: Number) {
        return Date.now() > timeStamp;
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
