import { MD5 } from "@blendsdk/stdlib";

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
        console.log("============================================")
        console.log({type, tenant, client, system})
        console.log("============================================")
        //return CRC32<string>([type, tenant, client, system].join("-"), { hexOutput: true });
        return MD5([type, tenant, client, system].join("-"))
    }
}

/**
 * Singleton
 */
export const portaAuthUtils = new PortaAuthUtils();
