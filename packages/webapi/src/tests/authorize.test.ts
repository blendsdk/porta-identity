import { IAuthorizeRequest } from "@porta/shared";
import { eClientType } from "../types";
import { PortaApi } from "./api";
import {
    adminUser,
    createClient,
    createCodeChallenge,
    createCodeVerifier,
    create_after_all,
    create_before_all,
    makeState,
    wait
} from "./lib";

const test_set = "default_flow_tests";

describe("Authorize Sequence Happy", () => {
    beforeAll(create_before_all(test_set));
    afterAll(create_after_all());

    test("Expire Access Token", async () => {
        const client = await createClient(test_set, eClientType.confidential, undefined, {
            access_token_ttl: 5
        });
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "offline_access",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        const { access_token }: any = await PortaApi.authorization.authorize(authRequest);
        await wait(7);
        await expect(
            PortaApi.authorization.userInfoPost({ access_token, tenant: "default_flow_tests" })
        ).rejects.toThrow("UNAUTHORIZED_ACCESS_TO_ENDPOINT");
    });

    test("Happy Flow With Refresh Token", async () => {
        const client = await createClient(test_set, eClientType.confidential);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "offline_access",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        const result: any = await PortaApi.authorization.authorize(authRequest);
        expect(result?.refresh_token).toBeTruthy();
    });

    test("Happy Flow No Refresh Token", async () => {
        const client = await createClient(test_set, eClientType.confidential);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        const result: any = await PortaApi.authorization.authorize(authRequest);
        expect(result?.refresh_token).toBeFalsy();
    });

    test("Invalid valid_until", async () => {
        const client = await createClient(test_set, undefined, undefined, {
            valid_until: new Date(Date.now() - 100000).toISOString()
        });
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        await expect(PortaApi.authorization.authorize(authRequest)).rejects.toThrow("invalid_request");
    });

    test("Invalid valid_from", async () => {
        const client = await createClient(test_set, undefined, undefined, {
            valid_from: new Date(Date.now() * 1.5).toISOString()
        });
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        await expect(PortaApi.authorization.authorize(authRequest)).rejects.toThrow("invalid_request");
    });

    test("Invalid PKCE code_challenge_method", async () => {
        const client = await createClient(test_set);
        const code_verifier = createCodeVerifier("hello");
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            code_challenge: await createCodeChallenge(code_verifier),
            code_challenge_method: "plain",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser,
                code_verifier
            })
        };
        const { error, error_description } = (await PortaApi.authorization.authorize(authRequest)) as any;
        expect(error).toEqual("invalid_request");
        expect(error_description).toEqual("invalid_pkce_parameters");
    });

    test("Invalid PKCE code_verifier", async () => {
        const client = await createClient(test_set);
        const code_verifier = createCodeVerifier("hello");
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            code_challenge: await createCodeChallenge(code_verifier),
            code_challenge_method: "S256",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser,
                code_verifier: "?????"
            })
        };
        const result = (await PortaApi.authorization.authorize(authRequest)) as any;
        expect(result.message).toEqual("invalid_request");
    });

    test("Invalid PKCE code_challenge", async () => {
        const client = await createClient(test_set);
        const code_verifier = createCodeVerifier("hello");
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            code_challenge: "?????",
            code_challenge_method: "S256",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser,
                code_verifier
            })
        };
        const result = (await PortaApi.authorization.authorize(authRequest)) as any;
        expect(result.message).toEqual("invalid_request");
    });

    test("Happy Flow PKCE", async () => {
        const client = await createClient(test_set);
        const code_verifier = createCodeVerifier("hello");
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            code_challenge: await createCodeChallenge(code_verifier),
            code_challenge_method: "S256",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser,
                code_verifier
            })
        };
        const result: any = await PortaApi.authorization.authorize(authRequest);
        expect(result?.access_token).toBeTruthy();
    });

    test("Invalid Credentials", async () => {
        const client = await createClient(test_set);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                username: "hello",
                password: "world"
            })
        };
        const { message } = (await PortaApi.authorization.authorize(authRequest)) as any;
        expect(message).toEqual("account_error");
    });

    test("Invalid Redirect URI", async () => {
        const client = await createClient(test_set);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: "?????????????????????",
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        await expect(PortaApi.authorization.authorize(authRequest)).rejects.toThrow("invalid_request");
    });

    test("Invalid Response Type", async () => {
        const client = await createClient(test_set);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "??????",
            scope: "some-scope",
            nonce: "m" + Date.now().toString(),
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        const { error, error_description } = (await PortaApi.authorization.authorize(authRequest)) as any;
        expect(error).toEqual("invalid_request");
        expect(error_description).toEqual("invalid_response_type");
    });

    test("Invalid Client", async () => {
        const client = await createClient(test_set);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: "???????????????",
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        await expect(PortaApi.authorization.authorize(authRequest)).rejects.toThrow("invalid_request");
    });

    test("Invalid tenant", async () => {
        const client = await createClient(test_set);
        const authRequest: IAuthorizeRequest = {
            tenant: "INVALID_TENANT",
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        await expect(PortaApi.authorization.authorize(authRequest)).rejects.toThrow("invalid_request");
    });

    test("Invalid Token Code", async () => {
        const client = await createClient(test_set);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope1",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser,
                code: "????????????????????????"
            })
        };
        const result: any = await PortaApi.authorization.authorize(authRequest);
        expect(result.message).toEqual("invalid_grant");
    });

    test("Invalid grant type", async () => {
        const client = await createClient(test_set);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "INVALID",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        const result: any = await PortaApi.authorization.authorize(authRequest);
        expect(result.message).toEqual("invalid_grant");
    });

    test("Invalid Public Client with client secret", async () => {
        const client = await createClient(test_set, eClientType.public);
        const code_verifier = createCodeVerifier("hello");

        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            code_challenge: await createCodeChallenge(code_verifier),
            code_challenge_method: "S256",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser,
                code_verifier
            })
        };
        const result: any = await PortaApi.authorization.authorize(authRequest);
        expect(result.message).toEqual("invalid_request");
    });

    test("Invalid Public Client No PKCE", async () => {
        const client = await createClient(test_set, eClientType.public);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        const result: any = await PortaApi.authorization.authorize(authRequest);
        expect(result.message).toEqual("invalid_request");
    });

    test("Incomplete PKCE parameters", async () => {
        const client = await createClient(test_set);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            code_challenge_method: "S256",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        const { error, error_description } = (await PortaApi.authorization.authorize(authRequest)) as any;
        expect(error).toEqual("invalid_request");
        expect(error_description).toEqual("invalid_pkce_parameters");
    });

    test("Invalid redirect_uri", async () => {
        const client = await createClient(test_set, eClientType.confidential, null);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        await expect(PortaApi.authorization.authorize(authRequest)).rejects.toThrow("invalid_request");
    });

    test("Happy Flow Confidential Client", async () => {
        const client = await createClient(test_set, eClientType.confidential);
        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: client.redirect_uri,
                ...adminUser
            })
        };
        const result: any = await PortaApi.authorization.authorize(authRequest);
        expect(result?.access_token).toBeTruthy();
    });
});
