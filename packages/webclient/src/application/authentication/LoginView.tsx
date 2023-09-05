import { useCallback, useEffect, useMemo, useState } from "react";
import {
    FIELD_SIZE,
    IAuthenticationDialogModel,
    IExistingAccount,
    eFlowState,
    isFlowExpired,
    updateUserSelectList,
    validateData
} from "./lib";
import { SessionLoadingView } from "@blendsdk/react";
import { ApplicationApi } from "../../system/api";
import { IFlowInfo } from "@porta/shared";
import { useSystemError } from "../../system/session";
import LogoImage from "../../resources/logo.svg";
import { useTranslation } from "../../system/i18n";
import { Button, Spinner } from "@fluentui/react-components";
import { InvalidSession } from "./InvalidSession";
import { useFormik } from "formik";
import { useCheckFlowStore } from "./store";
import { GetAccount } from "./GetAccount";
import { GetPassword } from "./GetPassword";
import { PickAccounts } from "./PickAccounts";
import { useStyles } from "./styles";
import * as yup from "yup";
import { isEmptyObject } from "@blendsdk/stdlib";
import { GetMFA } from "./GetMFA";
import Cookies from "js-cookie";

export const LoginView = () => {
    const { t } = useTranslation();
    const { catchSystemError } = useSystemError();
    const [flowState, setFlowState] = useState<number | undefined>(undefined);
    const [flowInfo, setFlowInfo] = useState<IFlowInfo | undefined>();
    const [useAnotherAccount, setUseAnotherAccount] = useState(false);
    const [accounts, setAccounts] = useState<IExistingAccount[]>([]);
    const checkFlow = useCheckFlowStore();
    const s = useStyles();

    const lastTenant = useMemo<string>(() => {
        return Cookies.get("_at") || "";
    }, []);

    const showPickAccount = useMemo(() => {
        return accounts.length !== 0 && useAnotherAccount;
    }, [accounts.length, useAnotherAccount]);

    const isInvalidFlow = isFlowExpired("_as") && flowState !== eFlowState.INVALID_SESSION;

    const finalizeAndRedirect = useCallback(
        (username: string) => {
            updateUserSelectList(lastTenant, username);
            setFlowState(eFlowState.COMPLETE);
            setTimeout(() => {
                window.location.href = checkFlow.signin_url || "";
            }, 250);
        },
        [checkFlow.signin_url, lastTenant]
    );

    const form = useFormik<IAuthenticationDialogModel>({
        validateOnMount: false,
        validateOnChange: false,
        initialValues: {
            username: "",
            password: "",
            mfa: ""
        },
        validate: (values) => {
            console.log(values);
            if (flowState === eFlowState.SELECT_ACCOUNT) {
                // if the store does not have an account(not check with the backend)
                // then validate the given username.

                if (checkFlow.account === undefined) {
                    // this must be checked against undefined because null is returned when the username is not found
                    const [valid, error] = validateData(values.username, (data: any) => {
                        yup.string().required("username_is_required").validateSync(data);
                    });
                    if (!valid) {
                        return {
                            username: error
                        };
                    } else {
                        return undefined;
                    }
                } else {
                    if (!checkFlow.account_state && !checkFlow.account_status) {
                        return {
                            username:
                                checkFlow.account_status === false
                                    ? "account_not_found"
                                    : checkFlow.account_state === false
                                    ? "account_is_disabled"
                                    : undefined
                        };
                    } else {
                        return undefined;
                    }
                }
            } else if (flowState === eFlowState.REQUIRE_PASSWORD) {
                if (checkFlow.password_state === undefined) {
                    const [valid, error] = validateData(values.password, (data: any) => {
                        yup.string().required("password_is_required").validateSync(data);
                    });
                    if (!valid) {
                        return {
                            password: error
                        };
                    } else {
                        return undefined;
                    }
                } else if (checkFlow.password_state === false) {
                    return {
                        password: "invalid_password"
                    };
                }
            } else if (flowState === eFlowState.START_MFA) {
                if (checkFlow.mfa_state_obj === undefined) {
                    const result: any = {};
                    (checkFlow.mfa_list || []).forEach((item) => {
                        const key = `mfa_${item}`;
                        const [valid, error] = validateData((values as any)[key], (data: any) => {
                            yup.string().required(`${key}_is_required`).validateSync(data);
                        });
                        if (!valid) {
                            result[key] = error;
                        }
                    });
                    return isEmptyObject(result) ? undefined : result;
                } else if (checkFlow.mfa_state_obj !== undefined) {
                    const result: any = {};
                    Object.entries(checkFlow.mfa_state_obj).forEach(([k, v]) => {
                        if (!v) {
                            result[k] = `invalid_${k}`;
                        }
                    });
                    return isEmptyObject(result) ? undefined : result;
                }
            } else {
                return undefined;
            }
        },
        onSubmit: (values, { validateForm }) => {
            if (form.isValid) {
                if (flowState === eFlowState.SELECT_ACCOUNT) {
                    checkFlow.check({ state: "check_account", options: values.username }).then(() => {
                        validateForm().then((valResult) => {
                            checkFlow.reset();
                            if (isEmptyObject(valResult)) {
                                setFlowState(eFlowState.REQUIRE_PASSWORD);
                            }
                        });
                    });
                } else if (flowState === eFlowState.REQUIRE_PASSWORD) {
                    checkFlow.check({ state: "check_pwd", options: values.password }).then(() => {
                        validateForm().then((valResult) => {
                            if (isEmptyObject(valResult)) {
                                if (checkFlow.mfa_list?.length !== 0) {
                                    checkFlow.reset();
                                    setFlowState(eFlowState.START_MFA);
                                } else {
                                    finalizeAndRedirect(form.values.username);
                                }
                            } else {
                                checkFlow.reset();
                            }
                        });
                    });
                } else if (flowState === eFlowState.START_MFA) {
                    const mfas: any = {};
                    Object.entries(values || {}).forEach(([k, v]) => {
                        if (k.startsWith("mfa_")) {
                            mfas[k] = v;
                        }
                    });
                    checkFlow.check({ state: "check_mfa", options: JSON.stringify(mfas) }).then(() => {
                        validateForm().then((valResult) => {
                            if (isEmptyObject(valResult)) {
                                finalizeAndRedirect(form.values.username);
                            } else {
                                checkFlow.reset();
                            }
                        });
                    });
                }
            }
        }
    });

    useEffect(() => {
        const checker = setInterval(() => {
            if (isInvalidFlow) {
                setFlowState(eFlowState.INVALID_SESSION);
                setFlowInfo(undefined);
            } else if (!flowState) {
                ApplicationApi.authorization
                    .flowInfo({})
                    .then(({ data }) => {
                        setFlowInfo(data);
                        const accounts = updateUserSelectList(lastTenant);
                        setAccounts(accounts);
                        setUseAnotherAccount(accounts.length !== 0);
                        setFlowState(eFlowState.SELECT_ACCOUNT);
                    })
                    .catch((err) => {
                        if (err.message === "INVALID_REQUEST_NO_FLOW") {
                            setFlowState(eFlowState.INVALID_SESSION);
                            setFlowInfo(undefined);
                        } else {
                            catchSystemError(err);
                        }
                    });
            }
        }, 1000);

        return () => {
            clearInterval(checker);
        };
    }, [accounts, catchSystemError, flowState, isInvalidFlow]);

    return !flowState ? (
        <SessionLoadingView />
    ) : (
        <div className={s.wrapper}>
            <form>
                <div className={s.authView}>
                    {flowInfo && flowState !== eFlowState.INVALID_SESSION && (
                        <img className={s.logo} src={flowInfo.logo || LogoImage} alt="logo" />
                    )}
                    {(!flowInfo && flowState !== eFlowState.INVALID_SESSION) || checkFlow.fetching ? (
                        <Spinner className={s.spinner} size="small" label={t("please_wait")} />
                    ) : null}
                    {!checkFlow.fetching && (
                        <div className={s.authViewContent}>
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
                            {flowState === eFlowState.START_MFA && <GetMFA form={form} />}
                            {flowState === eFlowState.COMPLETE && (
                                <Spinner
                                    className={s.spinner}
                                    size="small"
                                    label={t("please_wait_while_redirecting")}
                                />
                            )}
                            {flowState &&
                                flowState !== eFlowState.COMPLETE &&
                                flowState !== eFlowState.INVALID_SESSION && (
                                    <div data-footer="true" className={s.footer}>
                                        {flowState === eFlowState.SELECT_ACCOUNT && !showPickAccount && (
                                            <Button
                                                size={FIELD_SIZE}
                                                className={s.button}
                                                appearance="primary"
                                                onClick={() => {
                                                    form.submitForm();
                                                }}
                                            >
                                                {t("btn_next")}
                                            </Button>
                                        )}
                                        {flowState === eFlowState.REQUIRE_PASSWORD && (
                                            <Button
                                                size={FIELD_SIZE}
                                                className={s.button}
                                                appearance="outline"
                                                onClick={() => {
                                                    setFlowState(eFlowState.SELECT_ACCOUNT);
                                                }}
                                            >
                                                {t("btn_back")}
                                            </Button>
                                        )}
                                        {flowState === eFlowState.REQUIRE_PASSWORD && <div className={s.spacer} />}
                                        {(flowState === eFlowState.REQUIRE_PASSWORD ||
                                            flowState === eFlowState.START_MFA) && (
                                            <Button
                                                size={FIELD_SIZE}
                                                className={s.button}
                                                appearance="primary"
                                                onClick={() => {
                                                    form.submitForm();
                                                }}
                                            >
                                                {t(
                                                    checkFlow?.mfa_list?.length !== 0 &&
                                                        flowState === eFlowState.REQUIRE_PASSWORD
                                                        ? "btn_next"
                                                        : "btn_signin"
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                )}
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
};
