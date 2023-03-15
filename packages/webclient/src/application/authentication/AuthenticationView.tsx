import { catchSystemError, clearAllCookies, createApiStore, TRouterComponent } from "@blendsdk/react";
import { IAuthenticationFlowState, ICheckFlowRequest, ICheckFlowResponse, IFlowInfo } from "@porta/shared";
import { useFormik } from "formik";
import Cookies from "js-cookie";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslator } from "../../system/i18n";
import { PortaApi } from "../api";
import { eFlowState, IAuthenticationDialogModel, IExistingAccount } from "./types";
import * as yup from "yup";
import { isEmptyObject } from "@blendsdk/stdlib";
import { updateUserSelectList, useCheckFlow, validateData } from "./lib";
import { useStyles } from "./styles";
import { Button, mergeClasses } from "@fluentui/react-components";
import { InvalidSession } from "./InvalidSession";
import { GetAccount } from "./GetAccount";
import LogoImage from "../../resources/logo.svg";
import { GetPassword } from "./GetPassword";
import { PickAccounts } from "./PickAccounts";

export const AuthenticationView = () => {
    const { translate } = useTranslator();
    const [flowInfo, setFlowInfo] = useState<IFlowInfo>(undefined);
    const [flowState, setFlowState] = useState<number>(undefined);
    const [flowStarted, setFlowStarted] = useState<boolean>(false);
    const [accounts, setAccounts] = useState<IExistingAccount[]>([]);
    const styles = useStyles();

    const checkFlow = useCheckFlow();

    const [useAnotherAccount, setUseAnotherAccount] = useState(false);

    const showPickAccount = useMemo(() => {
        return accounts.length !== 0 && useAnotherAccount;
    }, [accounts.length, useAnotherAccount]);

    const form = useFormik<IAuthenticationDialogModel>({
        validateOnMount: false,
        validateOnChange: false,
        initialValues: {
            username: "",
            password: ""
        },
        validate: (values) => {
            if (flowState === eFlowState.SELECT_ACCOUNT) {
                if (!checkFlow.data) {
                    const [valid, error] = validateData(values.username, (data: any) => {
                        yup.string().required("username_is_required").validateSync(data);
                    });
                    if (!valid) {
                        return {
                            username: error
                        };
                    }
                } else {
                    const { account_state, account_status } = checkFlow.data;
                    if (!account_state || !account_state) {
                        return {
                            username:
                                account_status === false
                                    ? "account_not_found"
                                    : account_state === false
                                    ? "account_is_disabled"
                                    : undefined
                        };
                    }
                }
            } else if (flowState === eFlowState.REQUIRE_PASSWORD) {
                if (checkFlow.data) {
                    const { password_state } = checkFlow.data;
                    if (!password_state) {
                        return {
                            password: "invalid_password"
                        };
                    }
                }
            } else {
                return undefined;
            }
        },
        onSubmit: (values, { validateForm }) => {
            if (form.isValid) {
                if (flowState === eFlowState.SELECT_ACCOUNT) {
                    checkFlow
                        .fetch({ state: "check_account", options: values.username })
                        .then(() => {
                            validateForm().then((valResult) => {
                                Cookies.set("_l", values.username);
                                checkFlow.reset(false, null);
                                if (isEmptyObject(valResult)) {
                                    setFlowState(eFlowState.REQUIRE_PASSWORD);
                                }
                            });
                        })
                        .catch(catchSystemError);
                } else if (flowState === eFlowState.REQUIRE_PASSWORD) {
                    checkFlow
                        .fetch({ state: "check_pwd", options: values.password })
                        .then((checkResult) => {
                            validateForm().then((valResult) => {
                                checkFlow.reset(false, null);
                                if (isEmptyObject(valResult)) {
                                    // let's continue to mfa if needed
                                    if (checkResult.mfa_list && checkResult.mfa_list.length !== 0) {
                                        setFlowState(eFlowState.START_MFA);
                                    } else {
                                        updateUserSelectList(values.username);
                                        window.location.href = checkResult.signin_url;
                                    }
                                }
                            });
                        })
                        .catch(catchSystemError);
                }
            }
        }
    });

    useEffect(() => {
        const now = Date.now();
        const _as = Cookies.get("_as");

        let expire = now - 1;

        if (_as) {
            try {
                expire = parseInt(_as);
            } catch {
                //no-op
            }
        }

        // edge case
        if (isNaN(expire)) {
            expire = now - 1;
        }

        const checker = setInterval(() => {
            if (expire - Date.now() <= 0 && flowState !== eFlowState.INVALID_SESSION) {
                setFlowState(eFlowState.INVALID_SESSION);
            } else if (flowState === undefined && !flowStarted) {
                PortaApi.authorization
                    .flowInfo({})
                    .then(({ data }) => {
                        const accounts = updateUserSelectList();
                        setFlowInfo(data);
                        setAccounts(accounts);
                        setFlowState(eFlowState.SELECT_ACCOUNT);
                        setFlowStarted(true);
                        setUseAnotherAccount(accounts.length !== 0);
                    })
                    .catch((err: any) => {
                        if (err.message === "INVALID_REQUEST_NO_FLOW") {
                            setFlowState(eFlowState.INVALID_SESSION);
                        } else {
                            catchSystemError(err);
                        }
                    });
            }
        }, 1000);

        return () => {
            clearInterval(checker);
        };
    }, [flowState]);

    return (
        <div className={styles.wrapper}>
            <form onSubmit={form.handleSubmit}>
                <div className={mergeClasses(styles.authView)}>
                    {flowInfo && flowState !== eFlowState.INVALID_SESSION && (
                        <img className={styles.logo} src={flowInfo.logo || LogoImage} alt="logo" />
                    )}
                    {flowState === eFlowState.INVALID_SESSION && <InvalidSession />}
                    {flowState === eFlowState.SELECT_ACCOUNT && showPickAccount && (
                        <PickAccounts
                            onSelect={({ account, tenant }: IExistingAccount) => {
                                if (!tenant) {
                                    setUseAnotherAccount(false);
                                } else {
                                    form.setFieldValue("username", account);
                                    form.validateForm().then(() => {
                                        form.submitForm();
                                    });
                                }
                            }}
                            accounts={accounts}
                        />
                    )}
                    {flowState === eFlowState.SELECT_ACCOUNT && !showPickAccount && <GetAccount form={form} />}
                    {flowState === eFlowState.REQUIRE_PASSWORD && <GetPassword form={form} />}
                    <div className={styles.footer}>
                        {flowState === eFlowState.SELECT_ACCOUNT && !showPickAccount && (
                            <Button
                                appearance="primary"
                                disabled={checkFlow.fetching}
                                onClick={() => {
                                    form.submitForm();
                                }}
                            >
                                {translate("btn_next")}
                            </Button>
                        )}
                        {flowState === eFlowState.REQUIRE_PASSWORD && (
                            <Button
                                appearance="outline"
                                onClick={() => {
                                    debugger;
                                    setFlowState(eFlowState.SELECT_ACCOUNT);
                                }}
                            >
                                {translate("btn_back")}
                            </Button>
                        )}
                        {flowState === eFlowState.REQUIRE_PASSWORD && <div className={styles.spacer} />}
                        {flowState === eFlowState.REQUIRE_PASSWORD && (
                            <Button
                                appearance="primary"
                                onClick={() => {
                                    form.submitForm();
                                }}
                            >
                                {translate(
                                    checkFlow.data && checkFlow.data.mfa_list.length !== 0 ? "btn_next" : "btn_signin"
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </form>
        </div>
    );
};
