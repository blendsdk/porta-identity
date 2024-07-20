import { sha256Verify } from "@blendsdk/crypto";
import { IDictionaryOf, MD5, wrapInArray } from "@blendsdk/stdlib";
import { HttpRequest } from "@blendsdk/webafx-common";
import { ISysSession, ISysTenant } from "@porta/shared";
import { IPortaApplicationSetting, eOAuthPKCECodeChallengeMethod } from "../types";

class CommonUtils {
    /**
     * Gets the PORTA_REGISTRY_TENANT parameter
     *
     * @returns
     * @memberof CommonUtils
     */
    public getPortaRegistryTenant() {
        const { PORTA_REGISTRY_TENANT = undefined } = (process.env as any as IPortaApplicationSetting) || {};
        if (!PORTA_REGISTRY_TENANT) {
            throw new Error("Parameter PORTA_REGISTRY_TENANT is not set!");
        }
        return PORTA_REGISTRY_TENANT;
    }

    /**
     * @param {number} seconds
     * @return {*} 
     * @memberof CommonUtils
     */
    public secondsToMilliseconds(seconds: number) {
        return seconds * 1000;
    }

    /**
     * @param {number} milliseconds
     * @return {*} 
     * @memberof CommonUtils
     */
    public millisecondsToSeconds(milliseconds: number) {
        return Math.trunc(milliseconds / 1000);
    }

    /**
     * @param {number} seconds
     * @param {number} [now]
     * @return {*} 
     * @memberof CommonUtils
     */
    public expireSecondsFromNow(seconds: number, now?: number) {
        return (now || Date.now()) + this.secondsToMilliseconds(seconds);
    };


    /**
     * @param {HttpRequest} request
     * @return {*} 
     * @memberof CommonUtils
     */
    public getRemoteIP(request: HttpRequest) {
        return wrapInArray(
            request.headers["x-forwarded-for"] || request.headers["x-real-ip"] || request.socket.remoteAddress
        ).join("_").replace(/\:/gi, "_");
    }

    /**
     * @param {ISysTenant} tenantRecord
     * @param {HttpRequest} request
     * @return {*} 
     * @memberof CommonUtils
     */
    public createSessionCookieID(tenantRecord: ISysTenant, request: HttpRequest) {
        return MD5(["porta", tenantRecord.id, this.getRemoteIP(request)].join(""));
    }

    /**
     * Verifies PKCE
     *
     * @export
     * @param {string} code_challenge_method
     * @param {string} code_challenge
     * @param {string} code_verifier
     * @param {string[]} errors
     * @returns
     */
    public async verifyPkce(
        code_challenge_method: string,
        code_challenge: string,
        code_verifier: string,
        errors: string[]
    ) {
        switch (code_challenge_method) {
            case eOAuthPKCECodeChallengeMethod.S256:
                return sha256Verify(code_verifier, code_challenge, "base64url");
            default:
                return new Promise((resolve) => {
                    errors.push("code_challenge_method");
                    resolve(false);
                });
        }
    }


    /**
     * Parses a a string with spaces to an array
     *
     * @param {string} strTokens
     * @param {boolean} [caseSensitive]
     * @returns {IDictionaryOf<boolean>}
     * @memberof CommonUtils
     */
    public parseSeparatedTokens(strTokens: string, caseSensitive?: boolean): IDictionaryOf<boolean> {
        const data: IDictionaryOf<boolean> = {};
        caseSensitive = caseSensitive === true ? true : false;
        (strTokens || "")
            .replace(/ /gi, ",")
            .split(",")
            .filter(Boolean)
            .forEach((i) => {
                data[caseSensitive ? i : i.toLocaleLowerCase()] = true;
            });
        return data;
    }

    /**
     * @param {ISysSession} session
     * @param {number} max_age
     * @return {*} 
     * @memberof CommonUtils
     */
    public checkLoginRequired(session: ISysSession, max_age: number) {
        const date_created = new Date(session.date_created).getTime();
        return max_age ? this.millisecondsToSeconds(Date.now() - date_created) > max_age : false;
    }
}

export const commonUtils = new CommonUtils();