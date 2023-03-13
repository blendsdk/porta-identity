import { IAuthorizeRequest } from "@porta/shared";
import { application } from "../modules/application";
import { checkAndInitialize } from "../modules/commandline/commands/start";
import { eClientType } from "../types";
import { databaseUtils } from "../utils";
import { PortaApi } from "./api";
import {
    adminUser,
    BASE_URL,
    cleanTestTenant,
    createClient,
    createCodeChallenge,
    createCodeVerifier,
    initTestTenant,
    makeState
} from "./lib";
import { start_local_server, stop_local_server } from "./local_test_client";

const test_set = "default_flow_tests";

describe("Default Flow Tests", () => {
    beforeAll(async () => {
        const startClientServer = new Promise<void>((resolve) => {
            start_local_server(() => {
                resolve();
            });
        });
        await startClientServer;
        await application.run().then(async () => {
            PortaApi.setBaseUrl(BASE_URL);
        });
        await checkAndInitialize();
        await cleanTestTenant(test_set);
        await initTestTenant(test_set);
        await databaseUtils.initializeTenantDataSource(test_set);
    });

    afterAll(async () => {
        const stopClientServer = new Promise<void>((resolve) => {
            stop_local_server(() => {
                resolve();
            });
        });

        try {
            await stopClientServer;
            await application.stop();
        } catch (err) {
            console.error({ err });
        }
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
        const { message } = (await PortaApi.authorization.authorize(authRequest)) as any;
        expect(message).toEqual("invalid_grant");
    });

    // test("Invalid PKCE code_challenge_method", async () => {
    //     const client = await createClient(test_set);
    //     const code_verifier = createCodeVerifier("hello");
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         code_challenge: await createCodeChallenge(code_verifier),
    //         code_challenge_method: "plain",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser,
    //             code_verifier
    //         })
    //     };
    //     const { message } = (await PortaApi.authorization.authorize(authRequest)) as any;
    //     expect(message).toEqual("invalid_grant");
    // });

    // test("Invalid PKCE code_verifier", async () => {
    //     const client = await createClient(test_set);
    //     const code_verifier = createCodeVerifier("hello");
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         code_challenge: await createCodeChallenge(code_verifier),
    //         code_challenge_method: "S256",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser,
    //             code_verifier: "?????"
    //         })
    //     };
    //     const { message } = (await PortaApi.authorization.authorize(authRequest)) as any;
    //     expect(message).toEqual("invalid_grant");
    // });

    // test("Invalid PKCE code_challenge", async () => {
    //     const client = await createClient(test_set);
    //     const code_verifier = createCodeVerifier("hello");
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         code_challenge: "?????",
    //         code_challenge_method: "S256",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser,
    //             code_verifier
    //         })
    //     };
    //     const { message } = (await PortaApi.authorization.authorize(authRequest)) as any;
    //     expect(message).toEqual("invalid_grant");
    // });

    // test("Happy Flow PKCE", async () => {
    //     const client = await createClient(test_set);
    //     const code_verifier = createCodeVerifier("hello");
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         code_challenge: await createCodeChallenge(code_verifier),
    //         code_challenge_method: "S256",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser,
    //             code_verifier
    //         })
    //     };
    //     const result: any = await PortaApi.authorization.authorize(authRequest);
    //     expect(result?.access_token).toBeTruthy();
    // });

    // test("Invalid Credentials", async () => {
    //     const client = await createClient(test_set);
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             username: "hello",
    //             password: "world"
    //         })
    //     };
    //     const { message } = (await PortaApi.authorization.authorize(authRequest)) as any;
    //     expect(message).toEqual("INVALID_OR_MISSING_USERNAME");
    // });

    // test("Invalid Redirect URI", async () => {
    //     const client = await createClient(test_set);
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: "?????????????????????",
    //         response_type: "code",
    //         scope: "some-scope",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser
    //         })
    //     };
    //     await expect(PortaApi.authorization.authorize(authRequest)).rejects.toThrow("invalid_request");
    // });

    // test("Invalid Response Type", async () => {
    //     const client = await createClient(test_set);
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "??????",
    //         scope: "some-scope",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser
    //         })
    //     };
    //     await expect(PortaApi.authorization.authorize(authRequest)).rejects.toThrow("invalid_request");
    //     // const { message } = (await PortaApi.authorization.authorize(authRequest)) as any;
    //     // expect(message).toEqual("invalid_grant");
    // });

    // test("Invalid Client", async () => {
    //     const client = await createClient(test_set);
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: "???????????????",
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser
    //         })
    //     };
    //     await expect(PortaApi.authorization.authorize(authRequest)).rejects.toThrow("invalid_request");
    // });

    // test("Invalid tenant", async () => {
    //     const client = await createClient(test_set);
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: "INVALID_TENANT",
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser
    //         })
    //     };

    //     await expect(PortaApi.authorization.authorize(authRequest)).rejects.toThrow("invalid_request");
    // });

    // test("Invalid Token Code", async () => {
    //     const client = await createClient(test_set);
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser,
    //             code: "????????????????????????"
    //         })
    //     };
    //     const result: any = await PortaApi.authorization.authorize(authRequest);
    //     expect(result.error).toEqual(400);
    //     expect(result.message).toEqual("invalid_grant");
    // });

    // test("Invalid grant type", async () => {
    //     const client = await createClient(test_set);
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "INVALID",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser
    //         })
    //     };
    //     const result: any = await PortaApi.authorization.authorize(authRequest);
    //     expect(result.error).toEqual(400);
    //     expect(result.message).toEqual("invalid_grant");
    // });

    // test("Invalid Public Client with client secret", async () => {
    //     const client = await createClient(test_set, eClientType.public);
    //     const code_verifier = createCodeVerifier("hello");

    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         code_challenge: await createCodeChallenge(code_verifier),
    //         code_challenge_method: "S256",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser,
    //             code_verifier
    //         })
    //     };
    //     const result: any = await PortaApi.authorization.authorize(authRequest);
    //     expect(result.error).toEqual(400);
    //     expect(result.message).toEqual("invalid_grant");
    // });

    // test("Invalid Public Client No PKCE", async () => {
    //     const client = await createClient(test_set, eClientType.public);
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser
    //         })
    //     };
    //     const result: any = await PortaApi.authorization.authorize(authRequest);
    //     expect(result.error).toEqual(400);
    //     expect(result.message).toEqual("invalid_grant");
    // });

    // test("Basic flow Confidential Client", async () => {
    //     const client = await createClient(test_set, eClientType.confidential);
    //     const authRequest: IAuthorizeRequest = {
    //         tenant: test_set,
    //         client_id: client.client_id,
    //         redirect_uri: client.redirect_uri,
    //         response_type: "code",
    //         scope: "some-scope",
    //         state: makeState({
    //             tenant: test_set,
    //             grant_type: "authorization_code",
    //             client_secret: client.secret,
    //             client_id: client.client_id,
    //             redirect_uri: client.redirect_uri,
    //             ...adminUser
    //         })
    //     };
    //     const result: any = await PortaApi.authorization.authorize(authRequest);
    //     expect(result?.access_token).toBeTruthy();
    // });
});
