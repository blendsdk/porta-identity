import { FormFieldTextInput, Layout, ToolbarSpacer } from "@blendsdk/fui9";
import { Body1, Button, Link, tokens } from "@fluentui/react-components";
import { RESP_ACCOUNT } from "@porta/shared";
import React from "react";
import { useTranslation } from "../../../system";
import { LoginViewLogic } from "./LoginViewLogic";
import { useStyles } from "./styles";

export interface IGetAccount {
    login: LoginViewLogic;
    disabled?: boolean;
}

export const GetAccount: React.FC<IGetAccount> = ({ disabled, login }) => {
    const { t } = useTranslation();
    const styles = useStyles();
    const error = login.errors[RESP_ACCOUNT] || false;

    return (
        <Layout className={styles.page} display="flex" flex={1} flexDirection="column" gap={tokens.spacingVerticalM}>
            {error && <Body1 className={styles.error}>{t(error)}</Body1>}
            <FormFieldTextInput fieldLabel={t("username")} fieldName="username" form={login.form} t={t} />
            <FormFieldTextInput
                fieldLabel={t("password")}
                fieldName="password"
                inputProps={{ type: "password" }}
                form={login.form}
                t={t}
            />
            <ToolbarSpacer flex={1} />
            <Layout
                display="flex"
                flexDirection="row"
                justifyContent="flex-end"
                alignItems="center"
                gap={tokens.spacingHorizontalM}
            >
                {login.allow_reset_password && (
                    <>
                        <Link onClick={login.onForgotPasswordClick}>
                            <Body1>{t("forgot_password_link")}</Body1>
                        </Link>
                        <ToolbarSpacer />
                    </>
                )}
                <Button
                    appearance="primary"
                    onClick={() => {
                        login.form.submitForm();
                    }}
                    disabled={disabled || !login.form.isValid}
                    style={{ flex: login.allow_reset_password ? 1 : "none" }}
                >
                    {t("button_signin")}
                </Button>
            </Layout>
        </Layout>
    );
};
