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
        console.log("============================");
        const key = [type, tenant, client, url.hostname].join("-");
        const crc = CRC32<string>(key, { hexOutput: true });
        console.log({
            hostname: url.hostname,
            type,
            tenant,
            client,
            system,
            key,
            crc
        });
        console.log("============================");
        return crc;
    }
}

/**
 * Singleton
 */
export const portaAuthUtils = new PortaAuthUtils();
