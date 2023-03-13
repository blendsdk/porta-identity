import { createErrorObject, errorObjectInfo } from "@blendsdk/stdlib";
import axios from "axios";
import express from "express";
import { Server } from "http";
import { PortaApi } from "./api";
import { BASE_URL, parseState } from "./lib";

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
    if (_req.query.error) {
        res.status(200).json(_req.query);
    } else {
        const data: any = {
            ...parseState(_req.query?.state)
        };
        if (!data.code) {
            data.code = _req.query.code?.toString();
        }
        await axios
            .post(`${BASE_URL}/${data.tenant}/oauth2/token`, data)
            .then((_res) => {
                debugger;
                res.status(_res.status).send(_res.data);
            })
            .catch((_err) => {
                debugger;
                res.status(200).json({
                    error: _err.response.status,
                    ..._err.response?.data
                });
            });
    }
});

local_test_express.get("/fe/auth/signin", (req, res, _next) => {
    const { username, password } = parseState(req.query?.state);
    PortaApi.authorization
        .flowInfo({ af: req.query.af.toString() })
        .then(() => {
            PortaApi.authorization
                .checkFlow({
                    af: req.query.af.toString(),
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
                                af: req.query.af.toString(),
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
                                            debugger;
                                            res.status(_res.status).send(_res.data);
                                        })
                                        .catch((err) => {
                                            debugger;
                                            res.status(200).send(errorObjectInfo(err));
                                        });
                                } else {
                                    debugger;
                                    res.status(200).send(
                                        createErrorObject({
                                            message: "password_state"
                                        })
                                    );
                                }
                            })
                            .catch((err) => {
                                debugger;
                                res.status(200).send(errorObjectInfo(err));
                            });
                    }
                })
                .catch((err: any) => {
                    debugger;
                    res.status(200).send(errorObjectInfo(err));
                });
        })
        .catch((err: any) => {
            debugger;
            res.status(200).send(errorObjectInfo(err));
        });
});
