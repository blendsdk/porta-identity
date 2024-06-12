import { Body1, FormTextField, Layout, ToolbarSpacer, tokens } from "@blendsdk/fui8";
import { PrimaryButton } from "@fluentui/react";
import { makeStyles, shorthands } from "@griffel/react";
import { FormikProps } from "formik";
import React from "react";
import { useTranslation } from "../../../system";
import { IAuthenticationDialogModel, IUseAuthenticationFlowState } from "./hooks";

export interface IGetMFA {
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

export const GetMFA: React.FC<IGetMFA> = ({ form, disabled, flowState }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    return (
        <Layout className={styles.root} display="flex" flexDirection="column" gap={tokens.spacingM}>
            <FormTextField form={form} t={t} fieldName="mfa" placeholder={t(`mfa_${flowState.mfa_type}_text_placeholder`)} label={t("mfa_caption")} style={{ fontSize: "1.2rem", textAlign: "center" }} />
            <ToolbarSpacer flex={1} />
            {flowState.error && <Body1 style={{ color: tokens.paletteRed, textAlign: "center" }}>{t(flowState.resp)}</Body1>}
            <Layout display="flex" flexDirection="row" justifyContent="flex-end" alignItems="center" gap={tokens.spacingM}>
                <PrimaryButton
                    onClick={() => { form.submitForm(); }}
                    text={t("btn_next")}
                    disabled={disabled || !form.isValid}
                />
            </Layout>
        </Layout>
    );
};
