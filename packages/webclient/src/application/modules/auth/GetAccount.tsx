import { Body1, FormCheckboxField, FormTextField, Layout, ToolbarSpacer, tokens } from "@blendsdk/fui8";
import { Link } from "@blendsdk/react";
import { PrimaryButton } from "@fluentui/react";
import { makeStyles, shorthands } from "@griffel/react";
import { FormikProps } from "formik";
import React from "react";
import { useRouter, useTranslation } from "../../../system";
import { IAuthenticationDialogModel, IUseAuthenticationFlowState } from "./hooks";

export interface IGetAccount {
    form: FormikProps<IAuthenticationDialogModel>;
    flowState: IUseAuthenticationFlowState;
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

export const GetAccount: React.FC<IGetAccount> = ({ form, disabled, flowState }) => {
    const { t } = useTranslation();
    const router = useRouter();
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
                        <Link to={router.generateUrl("eAppRoutes.forgotPassword.path")} reload>
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
