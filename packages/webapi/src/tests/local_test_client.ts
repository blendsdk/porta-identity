import axios from "axios";
import express from "express";
import { Server } from "http";
import { PortaApi } from "./api";
import { flows } from "./flows";
import { BASE_URL } from "./lib";

let previousCookie = undefined;

axios.interceptors.request.use((config) => {
    if (previousCookie !== undefined) {
        config.withCredentials = true;
        config.headers["Cookie"] = previousCookie;
    }
    return config;
});

axios.interceptors.response.use((config) => {
    const cookies = config.headers["set-cookie"] || [];
    if (cookies && cookies.length !== 0) {
        previousCookie = cookies.join(";");
    }
    return config;
});

const local_test_express = express();
let local_test_server: Server = null;

local_test_express.use(express.json({ limit: 70000 }));
local_test_express.use(express.urlencoded({ extended: true, limit: 70000 }));

export const start_local_server = (callback: () => void) => {
    local_test_server = local_test_express.listen(4020, callback);
};

export const stop_local_server = (callback: () => void) => {
    local_test_server.close(callback);
};

local_test_express.get("/callback", async (_req, res) => {
    const token_params = flows[_req.query.state.toString()]?.token_params || {};
    const data = {
        ...token_params
    };
    if (!data.code) {
        data.code = _req.query.code.toString();
    }
    previousCookie = undefined;
    await axios
        .post(`${BASE_URL}/default/oauth2/token`, data)
        .then((_res) => {
            previousCookie = undefined;
            res.status(_res.status).send(_res.data);
        })
        .catch((_err) => {
            previousCookie = undefined;
            res.status(_err.response.status).send(_err.response?.data);
        })
});

local_test_express.get("/fe/auth/signin", (req, res, _next) => {
    previousCookie = req.headers.cookie;
    let { signin } = req.headers || {};
    const { username, password } = signin
        ? JSON.parse(Buffer.from(signin as string, "base64").toString())
        : { username: undefined, password: undefined };
    PortaApi.authorization
        .flowInfo({})
        .then(() => {
            PortaApi.authorization
                .checkFlow({
                    state: "check_account",
                    options: username
                })
                .then(({ data }) => {
                    const { account, account_status, account_state } = data;
                    if (account !== username) {
                        res.status(401).send("account_error");
                    } else if (!account_status) {
                        res.status(401).send("account_status");
                    } else if (!account_state) {
                        res.status(401).send("account_state");
                    } else {
                        PortaApi.authorization
                            .checkFlow({
                                state: "check_pwd",
                                options: password
                            })
                            .then(async ({ data }) => {
                                const { password_state, signin_url } = data;
                                if (password_state) {
                                    await axios
                                        .get(signin_url, {
                                            withCredentials: true
                                        })
                                        .then((_res) => {
                                            res.status(_res.status).send(_res.data);
                                        })
                                        .catch(({response}) => {
                                            res.status(response.status).send(response.data);
                                        });
                                } else {
                                    res.status(400).send("password_state");
                                }
                            })
                            .catch((err) => {
                                res.status(err.code).send(err.message);
                            });
                    }
                })
                .catch((err: any) => {
                    res.status(500).send(err.message);
                });
        })
        .catch((err: any) => {
            res.status(500).send(err.message);
        });
});
