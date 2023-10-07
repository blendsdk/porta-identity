import { CRC32 } from "@blendsdk/stdlib";

export enum eKeySignatureType {
    access_token = "access_token",
    refresh_token = "refresh_token",
    session_id = "session_id",
    session = "session_length",
    refresh_session = "refresh_session_length",
    user_list = "user_list"
}

export interface IPortaUtilsGetKeySignature {
    tenant: string;
    client: string;
    system: string;
    type: eKeySignatureType | string;
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
    public getKeySignature({ type, tenant, client, system }: IPortaUtilsGetKeySignature) {
        const url = new URL(system);
        console.log("============================")
        console.log({
            url:url.origin
        })
        return CRC32<string>([type, tenant, client, url.origin].join("-"), { hexOutput: true });
    }
}

/**
 * Singleton
 */
export const portaAuthUtils = new PortaAuthUtils();
