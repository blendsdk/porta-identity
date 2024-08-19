import { CRC32 } from "@blendsdk/stdlib";

export const COOKIE_AUTH_FLOW = "_af";
export const COOKIE_TENANT = "_tn";
export const COOKIE_AUTH_FLOW_TTL = "_aft";
export const LOCAL_STORAGE_LAST_LOGIN = "_ll";
export const MFA_RESEND_REQUEST = "resend";
export const FLOW_ERROR_INVALID = 'invalid_sign_in_flow';
export const RESP_ACCOUNT = "account";
export const RESP_MFA = "mfa";
export const RESP_CONSENT = "consent";
export const RESP_CHANGE_PASSWORD = "change_password";
export const RESP_FORGOT_PASSWORD = "forgot";
export const INVALID_PWD = "invalid_username_or_password";
export const INVALID_PWD_MATCH = "invalid_password_match";

export interface ILifetime {
    auth_time: string,
    date_expire: string;
}

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
     * @param {IPortaUtilsGetKeySignature} { type, tenant, client, system }
     * @return {*}
     * @memberof PortaAuthUtils
     */
    public getKeySignature({ type, tenant, client, system }: IPortaUtilsGetKeySignature) {
        const url = new URL(system);
        const key = [type, tenant, client, url.hostname].join("-");
        return CRC32<string>(key, { hexOutput: true });
    }

    /**
     * @param {string} tenant
     * @return {*}
     * @memberof PortaAuthUtils
     */
    public getSessionTTLKeys(tenant: string) {
        return {
            sessionKey: CRC32<string>([tenant, "session"].join("-"), { hexOutput: true }),
            sessionTTLKey: CRC32<string>([tenant, "ttl"].join("-"), { hexOutput: true })
        };
    }
}

/**
 * Singleton
 */
export const portaAuthUtils = new PortaAuthUtils();
