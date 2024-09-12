import { FormFieldTextInput, Layout, ToolbarSpacer } from "@blendsdk/fui9";
import { Body1, Button, tokens } from "@fluentui/react-components";
import { makeStyles, shorthands } from "@griffel/react";
import { RESP_MFA } from "@porta/shared";
import React from "react";
import { useTranslation } from "../../../system";
import { LoginViewLogic } from "./LoginViewLogic";

export interface IGetMFA {
    login: LoginViewLogic;
    disabled?: boolean;
}

const useStyles = makeStyles({
    root: {
        "& a": {
            ...shorthands.textDecoration("none"),
            ":hover": {
                ...shorthands.textDecoration("underline")
            }
        }
    },
    error: {
        marginTop: tokens.spacingVerticalS,
        padding: tokens.spacingVerticalS,
        textAlign: "center",
        backgroundColor: tokens.colorPaletteRedBackground3,
        color: "#fff"
    }
});

export const GetMFA: React.FC<IGetMFA> = ({ login, disabled }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    const error = login.errors[RESP_MFA] || false;

    return (
        <Layout className={styles.root} display="flex" flex={1} flexDirection="column" gap={tokens.spacingVerticalM}>
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
                    style={{ flex: 1 }}
                    onClick={login.onResendVerificationCode}
                    disabled={disabled}
                >
                    {t("btn_resend")}
                </Button>
                <Button
                    appearance="primary"
                    style={{ flex: 1 }}
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
