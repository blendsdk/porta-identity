import { Body1, FormCheckboxField, FormTextField, Layout, ToolbarSpacer, tokens } from "@blendsdk/fui8";
import { Link, PrimaryButton } from "@fluentui/react";
import { makeStyles, shorthands } from "@griffel/react";
import { FormikProps } from "formik";
import React from "react";
import { useTranslation } from "../../../system";
import { IAuthenticationDialogModel, IUseAuthenticationFlowState } from "./useAuthenticationFlow";

export interface IGetAccount {
    form: FormikProps<IAuthenticationDialogModel>;
    flowState: IUseAuthenticationFlowState;
    onForgotPassword: () => void;
    disabled?: boolean;
}

const useStyles = makeStyles({
    root: {
        "& a": {
            ...shorthands.textDecoration("none"),
            ":hover": {
                ...shorthands.textDecoration("underline"),
            }
        }
    }
});

export const GetAccount: React.FC<IGetAccount> = ({ form, disabled, flowState, onForgotPassword }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    return (
        <Layout className={styles.root} display="flex" flexDirection="column" gap={tokens.spacingM}>
            <FormTextField form={form} t={t} fieldName="username" />
            <FormTextField form={form} t={t} fieldName="password" type="password" />
            <FormCheckboxField form={form} t={t} fieldName="rememberMe" />
            <ToolbarSpacer flex={1} />
            {flowState.error && <Body1 style={{ color: tokens.paletteRed, textAlign: "center" }}>{t(flowState.resp)}</Body1>}
            <Layout display="flex" flexDirection="row" justifyContent="flex-end" alignItems="center" gap={tokens.spacingM}>
                {flowState?.allow_reset_password && (
                    <>
                        <Link onClick={onForgotPassword}>
                            <Body1>{t("forgot_password_link")}</Body1>
                        </Link>
                        <ToolbarSpacer />
                    </>
                )}
                <PrimaryButton
                    onClick={() => { form.submitForm(); }}
                    text={t("btn_signin")}
                    disabled={disabled || !form.isValid}
                    style={{ flex: flowState?.allow_reset_password ? 1 : "none" }}
                />
            </Layout>
        </Layout>
    );
};
