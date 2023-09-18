import { errorParserRegistry, IDictionaryOf } from "@blendsdk/stdlib";
import { sha256Verify } from "@blendsdk/crypto";
import * as x509 from "@peculiar/x509";
import * as crypto from "crypto";
import { eOAuthPKCECodeChallengeMethod, IErrorResponseParams, IPortaApplicationSetting } from "../types";

//const crypto = new Crypto();
x509.cryptoProvider.set(crypto);

export const PORTA_REGISTRY = "porta";

errorParserRegistry.push((data: IErrorResponseParams) => {
    const { error, error_description } = data || {};
    return error
        ? {
              message: error,
              cause: error_description
          }
        : undefined;
});

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

    public parseSeparatedTokens(strTokens: string, caseSensitive?: boolean): IDictionaryOf<boolean> {
        const data: IDictionaryOf<boolean> = {};
        caseSensitive = caseSensitive === true ? true : false;
        strTokens
            .replace(/ /gi, ",")
            .split(",")
            .filter(Boolean)
            .forEach((i) => {
                data[caseSensitive ? i : i.toLocaleLowerCase()] = true;
            });
        return data;
    }

    public getUUID() {
        // random bytes length is arbitrary
        return crypto.createHash("sha256").update(crypto.randomBytes(32).toString("hex")).digest("hex");
    }

    /**
     * Tries and clean to parse a string into an array.
     * If not possible then return an array with the input as its element
     *
     * @param {string} data
     * @returns
     * @memberof CommonUtils
     */
    public parseToArray(data: string) {
        let result = [];
        if (data) {
            data = data.toString().trim();
            try {
                if (data.startsWith("[") && data.endsWith("]")) {
                    result = JSON.parse(data);
                } else {
                    result.push(data);
                }
            } catch (err) {
                result.push(data);
            }
        }
        return result.filter(Boolean);
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

    public async generateKeyPareAndCertificate(name: string) {
        const alg = {
            name: "RSASSA-PKCS1-v1_5",
            hash: { name: "SHA-256" },
            publicExponent: new Uint8Array([1, 0, 1]),
            modulusLength: 2048
        };
        const endDate = new Date();
        endDate.setFullYear(endDate.getFullYear() + 50);
        const keys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);

        const cert = await x509.X509CertificateGenerator.createSelfSigned({
            serialNumber: Date.now().toString(),
            name: `CN=${name}`,
            notBefore: new Date(),
            notAfter: endDate,
            signingAlgorithm: alg,
            keys,
            extensions: [
                new x509.BasicConstraintsExtension(true, 2, true),
                new x509.ExtendedKeyUsageExtension(["1.2.3.4.5.6.7", "2.3.4.5.6.7.8"], true),
                new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
                await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
            ]
        });

        const private_key = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");

        return {
            publicKey:
                "-----BEGIN PUBLIC KEY-----\n" + cert.publicKey.toString("base64") + "\n-----END PUBLIC KEY-----",
            privateKey: "-----BEGIN PRIVATE KEY-----\n" + private_key + "\n-----END PRIVATE KEY-----",
            certificate: "-----BEGIN CERTIFICATE-----\n" + cert.toString("base64") + "\n-----END CERTIFICATE-----"
        };
    }
}

export const commonUtils = new CommonUtils();
