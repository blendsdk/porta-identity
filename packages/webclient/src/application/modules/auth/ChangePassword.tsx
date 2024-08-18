import { Body1, Body2, FormTextField, Layout, ToolbarSpacer, tokens } from "@blendsdk/fui8";
import { PrimaryButton } from "@fluentui/react";
import { makeStyles, shorthands } from "@griffel/react";
import { FormikProps } from "formik";
import React from "react";
import { useTranslation } from "../../../system";
import { IAuthenticationDialogModel, IUseAuthenticationFlowState } from "./useAuthenticationFlow";

export interface IChangePassword {
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

export const ChangePassword: React.FC<IChangePassword> = ({ form, flowState }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    return (
        <Layout className={styles.root} display="flex" flexDirection="column" gap={tokens.spacingM}>
            <Body2 style={{ marginTop: tokens.spacingM }}>{t("change_password_text")}</Body2>
            <FormTextField form={form} t={t} fieldName="password" label={t("current_password")} type="password" />
            {flowState.error && <Body1 style={{ color: tokens.paletteRed, textAlign: "center" }}>{t(flowState.resp)}</Body1>}
            <FormTextField form={form} t={t} fieldName="new_password" type="password" />
            <FormTextField form={form} t={t} fieldName="new_password_confirm" type="password" />
            <ToolbarSpacer flex={1} />
            <Layout display="flex" flexDirection="row" justifyContent="flex-end" alignItems="center" gap={tokens.spacingM}>
                <PrimaryButton
                    onClick={() => { form.submitForm(); }}
                    text={t("btn_confirm_change_password")}
                    disabled={!form.isValid}
                    style={{ flex: flowState?.allow_reset_password ? 1 : "none" }}
                />
            </Layout>
        </Layout>
    );
};
