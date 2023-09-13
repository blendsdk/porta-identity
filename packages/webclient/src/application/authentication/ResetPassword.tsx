import { IForgotPasswordFlowInfo } from "@porta/shared";
import { Fragment, useEffect, useState } from "react";
import { useRouter, useSystemError } from "../../system/session";
import { useStyles } from "./styles";
import { SessionLoadingView } from "@blendsdk/react";
import { FIELD_SIZE, eFlowState } from "./lib";
import LogoImage from "../../resources/logo.svg";
import { OrgName } from "./OrgName";
import { ApplicationApi } from "../../system/api";
import { InvalidSession } from "./InvalidSession";
import { useTranslation } from "../../system/i18n";
import { Body1, Button, Input, Spinner, Subtitle1 } from "@fluentui/react-components";
import { useFormik } from "formik";
import * as yup from "yup";
import { useCheckFlowStore } from "./store";

interface IResetPasswordDialogModel {
    password: string;
    confirmPassword: string;
    flow: string;
}

const validationSchema = yup.object({
    password: yup
        .string()
        .required("please_provide_a_password")
        // check minimum characters
        .min(8, "password_must_have_at_least_8_characters")
        // different error messages for different requirements
        .matches(/[0-9]/, "password_not_strong")
        .matches(/[a-z]/, "password_not_strong")
        .matches(/[A-Z]/, "password_not_strong")
        .matches(/[`!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/, "password_not_strong"),
    confirmPassword: yup
        .string()
        .required("please_re_type_your_password")
        // use oneOf to match one of the values inside the array.
        // use "ref" to get the value of password.
        .oneOf([yup.ref("password")], "passwords_do_not_match")
});

export const ResetPassword = () => {
    const { t } = useTranslation();
    const { catchSystemError } = useSystemError();
    const [flowState, setFlowState] = useState<number | undefined>(undefined);
    const [flowInfo, setFlowInfo] = useState<IForgotPasswordFlowInfo | undefined>();
    const s = useStyles();
    const requestFlow = useCheckFlowStore();
    const router = useRouter();
    const { flow } = router.getParameters<{ flow: string }>();

    const form = useFormik<IResetPasswordDialogModel>({
        validateOnMount: false,
        validateOnChange: false,
        initialValues: {
            password: "",
            confirmPassword: "",
            flow
        },
        validationSchema,
        onSubmit: (values) => {
            if (form.isValid) {
                setFlowState(eFlowState.RESET_PASSWORD_PROGRESS);
                requestFlow
                    .requestPasswordReset(values)
                    .then(() => {
                        setFlowState(eFlowState.COMPLETE);
                    })
                    .catch(catchSystemError);
            }
        }
    });

    useEffect(() => {
        const checker = setInterval(() => {
            if (!flow) {
                setFlowState(eFlowState.INVALID_SESSION);
                setFlowInfo(undefined);
            } else if (!flowState && flow) {
                ApplicationApi.authorization
                    .checkPasswordResetRequest({ flow })
                    .then(({ data }) => {
                        if (data) {
                            setFlowInfo(data);
                            setFlowState(eFlowState.RESET_PASSWORD_FLOW);
                        } else {
                            setFlowInfo(undefined);
                            setFlowState(eFlowState.INVALID_SESSION);
                        }
                    })
                    .catch((err) => {
                        if (err.message === "INVALID_MATCHING_FLOW") {
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
    }, [catchSystemError, flow, flowState]);

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
                                caption="invalid_reset_password_session_caption"
                                message="invalid_reset_password_session_message"
                            />
                        )}
                        {(!flowInfo && flowState === eFlowState.RESET_PASSWORD_PROGRESS) || requestFlow.fetching ? (
                            <Spinner className={s.spinner} size="small" label={t("please_wait")} />
                        ) : null}
                        {flowInfo && flowState === eFlowState.RESET_PASSWORD_FLOW && (
                            <Fragment>
                                <Subtitle1>{t("reset_password", flowInfo)}</Subtitle1>
                                <Input
                                    size={FIELD_SIZE}
                                    type="password"
                                    id="password"
                                    name="password"
                                    autoFocus
                                    onChange={form.handleChange}
                                    value={form.values.password}
                                    placeholder={t("please_provide_a_password")}
                                ></Input>
                                {form.errors?.password && (
                                    <Body1 className={s.validation}>{t(form.errors?.password)}</Body1>
                                )}
                                <Input
                                    size={FIELD_SIZE}
                                    type="password"
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    autoFocus
                                    onChange={form.handleChange}
                                    value={form.values.confirmPassword}
                                    placeholder={t("please_re_type_your_password")}
                                ></Input>
                                {form.errors?.confirmPassword && (
                                    <Body1 className={s.validation}>{t(form.errors?.confirmPassword)}</Body1>
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
                                        {t("reset_password_btn")}
                                    </Button>
                                </div>
                            </Fragment>
                        )}
                        {flowInfo && flowState === eFlowState.COMPLETE && (
                            <Body1 align="center">{t("reset_password_complete")}</Body1>
                        )}
                    </div>
                    <OrgName flowInfo={flowInfo} flowState={flowState} />
                </div>
            </form>
        </div>
    );
};
