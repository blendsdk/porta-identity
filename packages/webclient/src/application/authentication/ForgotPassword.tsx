import { SessionLoadingView } from "@blendsdk/react";
import { Body1, Button, Input, Spinner, Subtitle1 } from "@fluentui/react-components";
import { IForgotPasswordFlowInfo } from "@porta/shared";
import { useFormik } from "formik";
import { Fragment, useEffect, useState } from "react";
import * as yup from "yup";
import LogoImage from "../../resources/logo.svg";
import { ApplicationApi } from "../../system/api";
import { useTranslation } from "../../system/i18n";
import { useSystemError } from "../../system/session";
import { InvalidSession } from "./InvalidSession";
import { OrgName } from "./OrgName";
import { FIELD_SIZE, eFlowState, isFlowExpired } from "./lib";
import { useCheckFlowStore } from "./store";
import { useStyles } from "./styles";

interface IForgotPasswordDialogModel {
    account: string;
}

const validationSchema = yup.object({
    account: yup.string().required("account_is_required")
});

export const ForgotPassword = () => {
    const { t } = useTranslation();
    const { catchSystemError } = useSystemError();
    const [flowState, setFlowState] = useState<number | undefined>(undefined);
    const [flowInfo, setFlowInfo] = useState<IForgotPasswordFlowInfo | undefined>();
    const s = useStyles();
    const requestFlow = useCheckFlowStore();

    const form = useFormik<IForgotPasswordDialogModel>({
        validateOnMount: false,
        validateOnChange: false,
        initialValues: {
            account: ""
        },
        validationSchema,
        onSubmit: (values) => {
            if (form.isValid) {
                setFlowState(eFlowState.FORGOT_PASSWORD_PROGRESS);
                requestFlow
                    .forgotPasswordRequestAccount(values.account)
                    .then(() => {
                        setFlowState(eFlowState.COMPLETE);
                    })
                    .catch(catchSystemError);
            }
        }
    });

    useEffect(() => {
        const checker = setInterval(() => {
            const isInvalidFlow = isFlowExpired("_as") && flowState !== eFlowState.INVALID_SESSION;
            if (isInvalidFlow) {
                console.log({ isInvalidFlow });
                setFlowState(eFlowState.INVALID_SESSION);
                setFlowInfo(undefined);
            } else if (!flowState) {
                ApplicationApi.authorization
                    .forgotPasswordFlowInfo({ tenant: "" })
                    .then(({ data }) => {
                        setFlowInfo(data);
                        setFlowState(eFlowState.FORGOT_PASSWORD_GET_EMAIL);
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
    }, [catchSystemError, flowState]);

    return !flowState ? (
        <SessionLoadingView />
    ) : (
        <div className={s.wrapper}>
            <form>
                <div className={s.authView}>
                    {flowInfo && flowState !== eFlowState.INVALID_SESSION && (
                        <div className={s.logo} style={{ backgroundImage: `url(${flowInfo.logo || LogoImage})` }} />
                    )}
                    <div className={s.authViewContent}>
                        {flowState === eFlowState.INVALID_SESSION && (
                            <InvalidSession
                                caption="invalid_auth_session_caption"
                                message="invalid_logout_session_message"
                            />
                        )}
                        {(!flowInfo && flowState === eFlowState.FORGOT_PASSWORD_PROGRESS) || requestFlow.fetching ? (
                            <Spinner className={s.spinner} size="small" label={t("please_wait")} />
                        ) : null}
                        {flowInfo && flowState === eFlowState.FORGOT_PASSWORD_GET_EMAIL && (
                            <Fragment>
                                <Subtitle1>{t("forgot_password_link", flowInfo)}</Subtitle1>
                                <Input
                                    size={FIELD_SIZE}
                                    id="account"
                                    name="account"
                                    autoFocus
                                    onChange={form.handleChange}
                                    value={form.values.account}
                                    placeholder={t("forgot_password_text_placeholder")}
                                ></Input>
                                {form.errors?.account && (
                                    <Body1 className={s.validation}>{t(form.errors?.account)}</Body1>
                                )}
                                <div data-footer="true" className={s.footer}>
                                    <Button
                                        size={FIELD_SIZE}
                                        className={s.button}
                                        appearance="primary"
                                        onClick={() => {
                                            form.submitForm();
                                        }}
                                    >
                                        {t("forgot_password_btn")}
                                    </Button>
                                </div>
                            </Fragment>
                        )}
                        {flowInfo && flowState === eFlowState.COMPLETE && (
                            <Body1 align="center">{t("forgot_password_complete")}</Body1>
                        )}
                    </div>
                    <OrgName flowInfo={flowInfo} flowState={flowState} />
                </div>
            </form>
        </div>
    );
};
