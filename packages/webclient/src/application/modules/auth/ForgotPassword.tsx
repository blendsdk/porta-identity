import { Body1, FormTextField, Layout, ToolbarSpacer, tokens } from "@blendsdk/fui8";
import { PrimaryButton } from "@fluentui/react";
import { makeStyles, shorthands } from "@griffel/react";
import { FormikProps } from "formik";
import React from "react";
import { useTranslation } from "../../../system";
import { IAuthenticationDialogModel, IUseAuthenticationFlowState } from "./useAuthenticationFlow";

export interface IForgotPassword {
    form: FormikProps<IAuthenticationDialogModel>;
    flowState: IUseAuthenticationFlowState;
    //onForgotPassword: () => void;
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

export const ForgotPassword: React.FC<IForgotPassword> = ({ form }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    return (
        <Layout className={styles.root} display="flex" flexDirection="column" gap={tokens.spacingM}>
            <Body1>{t("forgot_password_text")}</Body1>
            <FormTextField form={form} t={t} fieldName="username" placeholder={t("forgot_password_text_placeholder")} />
            <ToolbarSpacer flex={1} />
            <Layout display="flex" flexDirection="row" justifyContent="flex-end" alignItems="center" gap={tokens.spacingM}>
                <PrimaryButton
                    onClick={() => { form.submitForm(); }}
                    text={t("btn_forgot_password")}
                    disabled={!form.isValid}
                />
            </Layout>
        </Layout>
    );
};
