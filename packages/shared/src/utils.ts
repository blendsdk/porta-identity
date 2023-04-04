import { MD5 } from "@blendsdk/stdlib";

export enum eKeySignatureType {
    access_token = "access_token",
    refresh_token = "refresh_token",
    session_id = "session_id",
    session = "session_length",
    refresh_session = "refresh_session_length",
    user_list = "user_list"
}

export class PortaAuthUtils {
    /**
     * Creates a per tenant access token key signature
     *
     * @param {string} tenant
     * @param {string} system
     * @param {eKeySignatureType} type
     * @returns
     * @memberof PortaAuthUtils
     */
    public getKeySignature(tenant: string, system: string, type: eKeySignatureType | string) {
        return MD5(JSON.stringify({ type, tenant, system }));
    }
}

/**
 * Singleton
 */
export const portaAuthUtils = new PortaAuthUtils();
