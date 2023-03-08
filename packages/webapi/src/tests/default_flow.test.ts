import { IAuthorizeRequest } from "@porta/shared";
import { application } from "../modules/application";
import { checkAndInitialize } from "../modules/commandline/commands/start";
import { databaseUtils } from "../utils";
import { PortaApi } from "./api";
import { adminUser, BASE_URL, cleanTestTenant, constCreateClient, initTestTenant, makeState } from "./lib";
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

    test("basic flow", async () => {
        const { client, redirect } = await constCreateClient(test_set);

        const authRequest: IAuthorizeRequest = {
            tenant: test_set,
            client_id: client.client_id,
            redirect_uri: redirect.redirect_uri,
            response_type: "code",
            scope: "some-scope",
            state: makeState({
                tenant: test_set,
                grant_type: "authorization_code",
                client_secret: client.secret,
                client_id: client.client_id,
                redirect_uri: redirect.redirect_uri,
                ...adminUser
            })
        };
        const result: any = await PortaApi.authorization.authorize(authRequest);
        expect(result?.access_token).toBeTruthy();
    });

    // test("sign in happy flow", async () => {
    //     expect.assertions(1);
    //     try {
    //         const tenant = await databaseUtils.findTenant(test_set);

    //         const { client } = await databaseUtils.createClient(
    //             null,
    //             {
    //                 client_id: undefined,
    //                 redirect_uri: flows.happy_flow.request.redirect_uri
    //             },
    //             tenant
    //         );
    //         flows.happy_flow.request.client_id = client.client_id;

    //         const { data } = await axios.get(getAuthEndpoint(test_set), {
    //             withCredentials: true,
    //             beforeRedirect: authenticateUser(flows.happy_flow.auth),
    //             params: flows.happy_flow.request
    //         });
    //         expect(data.access_token).toBeTruthy();
    //     } catch ({ response }) {
    //         expect(response).toBeFalsy();
    //     }
    // });

    /*

    test("invalid grant type", async () => {
        expect.assertions(1);
        try {
            const { data } = await axios.get(getAuthEndpoint(), {
                withCredentials: true,
                beforeRedirect: authenticateUser(flows.invalid_grant_type.auth),
                params: flows.invalid_grant_type.request
            });
            expect(data.access_token).toBeFalsy();
        } catch ({ response }) {
            expect(response.data.context.errors[0].grant_type).toEqual("invalid");
        }
    });

    test("invalid pkce code challenge method", async () => {
        expect.assertions(1);
        try {
            const { data } = await axios.get(getAuthEndpoint(), {
                withCredentials: true,
                beforeRedirect: authenticateUser(flows.invalid_code_challenge_method.auth),
                params: flows.invalid_code_challenge_method.request
            });
            expect(data.access_token).toBeTruthy();
        } catch ({ response }) {
            expect(response.data.context.errors[0].code_challenge_method).toEqual("ZZZ");
        }
    });

    test("sign in happy flow with pkce", async () => {
        expect.assertions(1);
        try {
            const { data } = await axios.get(getAuthEndpoint(), {
                withCredentials: true,
                beforeRedirect: authenticateUser(flows.happy_flow_with_pkce.auth),
                params: flows.happy_flow_with_pkce.request
            });
            expect(data.access_token).toBeTruthy();
        } catch ({ response }) {
            expect(response).toBeFalsy();
        }
    });

    test("invalid token code", async () => {
        expect.assertions(1);
        try {
            const { data } = await axios.get(getAuthEndpoint(), {
                withCredentials: true,
                beforeRedirect: authenticateUser(flows.invalid_token_code.auth),
                params: flows.invalid_token_code.request
            });
            expect(data).toBeFalsy();
        } catch ({ response }) {
            expect(response.data.context.errors).toContain("invalid_code");
        }
    });

    test("invalid redirect_uri", async () => {
        expect.assertions(2);
        try {
            await axios.get(getAuthEndpoint(), {
                params: {
                    client_id: "webapp-client",
                    redirect_uri: "some",
                    response_type: "code",
                    response_mode: "query",
                    nonce: encodeURIComponent(new Date().toString()),
                    scope: "something"
                }
            });
        } catch ({ response }) {
            expect(response.data.error).toEqual("INVALID_OAUTH_REQUEST");
            expect(response.data.context.errors[0].redirect_uri).toEqual("some");
        }
    });

    test("invalid client_id", async () => {
        expect.assertions(2);
        try {
            await axios.get(getAuthEndpoint(), {
                params: {
                    client_id: "some",
                    redirect_uri: "some",
                    response_type: "code",
                    response_mode: "query",
                    nonce: encodeURIComponent(new Date().toString()),
                    scope: "something"
                }
            });
        } catch ({ response }) {
            expect(response.data.error).toEqual("INVALID_OAUTH_REQUEST");
            expect(response.data.context.errors[0].client_id).toEqual("some");
        }
    });

    test("invalid tenant", async () => {
        expect.assertions(2);
        try {
            await axios.get(getAuthEndpoint("unknown"), {
                params: {
                    client_id: "some",
                    redirect_uri: "some",
                    response_type: "code",
                    response_mode: "query",
                    nonce: encodeURIComponent(new Date().toString()),
                    scope: "something"
                }
            });
        } catch ({ response }) {
            expect(response.data.error).toEqual("INVALID_OAUTH_REQUEST");
            expect(response.data.context.errors[0].tenant).toBeFalsy();
        }
    });

    test("invalid response_mode", async () => {
        expect.assertions(2);
        try {
            await axios.get(getAuthEndpoint("unknown"), {
                params: {
                    client_id: "some",
                    redirect_uri: "some",
                    response_type: "code",
                    response_mode: "some",
                    nonce: encodeURIComponent(new Date().toString()),
                    scope: "something"
                }
            });
        } catch ({ response }) {
            expect(response.data.error).toEqual("INVALID_OAUTH_REQUEST");
            expect(response.data.context.errors[0].response_mode).toEqual("some");
        }
    });

    test("invalid response_type", async () => {
        expect.assertions(2);
        try {
            await axios.get(getAuthEndpoint("unknown"), {
                params: {
                    client_id: "some",
                    redirect_uri: "some",
                    response_type: "some",
                    response_mode: "some",
                    nonce: encodeURIComponent(new Date().toString()),
                    scope: "something"
                }
            });
        } catch ({ response }) {
            expect(response.data.error).toEqual("INVALID_OAUTH_REQUEST");
            expect(response.data.context.errors[0].response_type).toEqual("some");
        }
    });

    test("sanity", async () => {
        const res = await PortaApi.blend.getAppVersion();
        expect(res?.data).toBeTruthy();
    });

    */
});
