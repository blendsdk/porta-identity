import { FormFieldTextInput, Layout, ToolbarSpacer } from "@blendsdk/fui9";
import { Body1, Button, tokens } from "@fluentui/react-components";
import { RESP_MFA } from "@porta/shared";
import React from "react";
import { useTranslation } from "../../../system";
import { LoginViewLogic } from "./LoginViewLogic";
import { useStyles } from "./styles";

export interface IGetMFA {
    login: LoginViewLogic;
    disabled?: boolean;
}

export const GetMFA: React.FC<IGetMFA> = ({ login, disabled }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    const error = login.errors[RESP_MFA] || false;

    return (
        <Layout className={styles.page} display="flex" flex={1} flexDirection="column" gap={tokens.spacingVerticalM}>
            <ToolbarSpacer flex={1} />
            {error && <Body1 className={styles.error}>{t(login.errors[RESP_MFA])}</Body1>}
            <FormFieldTextInput
                form={login.form}
                t={t}
                fieldName="mfa"
                inputProps={{
                    placeholder: t(`mfa_${login.mfa_type}_text_placeholder`),
                    style: { fontSize: "1.2rem", textAlign: "center" }
                }}
                fieldLabel={t("mfa_caption")}
            />
            <ToolbarSpacer flex={1} />
            <Layout
                display="flex"
                flexDirection="row"
                justifyContent="center"
                alignItems="center"
                gap={tokens.spacingHorizontalM}
            >
                <Button
                    appearance="secondary"
                    className={styles.fill}
                    onClick={login.onResendVerificationCode}
                    disabled={disabled}
                >
                    {t("btn_resend")}
                </Button>
                <Button
                    appearance="primary"
                    className={styles.fill}
                    onClick={() => {
                        login.form.submitForm();
                    }}
                    disabled={disabled || !login.form.isValid}
                >
                    {t("btn_verify")}
                </Button>
            </Layout>
        </Layout>
    );
};
