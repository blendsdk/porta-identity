import { ITokenRequest } from "@porta/shared";
import axios from "axios";
import { application } from "../modules/application";
import { checkAndInitialize } from "../modules/commandline/commands/start";
import { eOAuthGrantType } from "../types";
import { PortaApi } from "./api";
import { BASE_URL, getTokenEndpoint } from "./lib";
import { start_local_server, stop_local_server } from "./local_test_client";

describe("M2M Flow Tests", () => {
    beforeAll(async () => {
        const startClientServer = new Promise<void>((resolve) => {
            start_local_server(() => {
                resolve();
            });
        });
        await startClientServer;
        await application.run().then(async () => {
            PortaApi.setBaseUrl(BASE_URL);
            await checkAndInitialize();
        });
    });

    afterAll(async () => {
        const stopClientServer = new Promise<void>((resolve) => {
            stop_local_server(() => {
                resolve();
            });
        });

        await stopClientServer;
        await application.stop();
    });

    test("happy flow", async () => {
        expect.assertions(1);
        try {
            const {data} = await axios.post(getTokenEndpoint(), {
                client_id: "confidential-client",
                client_secret: "secret",
                grant_type:eOAuthGrantType.client_credentials
            } as ITokenRequest);
            expect(data.access_token).toBeTruthy();
        } catch ({ response }) {
            expect(response).toBeFalsy();
        }
    });
});
