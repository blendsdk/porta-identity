import { FormFieldTextInput, Layout, ToolbarSpacer } from "@blendsdk/fui9";
import { Body1, Body2, Button, tokens } from "@fluentui/react-components";
import { RESP_CHANGE_PASSWORD } from "@porta/shared";
import React from "react";
import { useTranslation } from "../../../system";
import { LoginViewLogic } from "./LoginViewLogic";
import { useStyles } from "./styles";

export interface IChangePassword {
    login: LoginViewLogic;
    disabled?: boolean;
}

export const ChangePassword: React.FC<IChangePassword> = ({ login, disabled }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    const error = login.errors[RESP_CHANGE_PASSWORD] || false;

    return (
        <Layout className={styles.page} display="flex" flexDirection="column" gap={tokens.spacingVerticalM}>
            <Body2 className={styles.warn} style={{ marginTop: tokens.spacingVerticalM }}>
                {t("change_password_text")}
            </Body2>
            {error && <Body1 className={styles.error}>{t(error)}</Body1>}
            <FormFieldTextInput
                form={login.form}
                t={t}
                fieldName="password"
                fieldLabel={t("current_password")}
                inputProps={{ type: "password" }}
            />
            <FormFieldTextInput form={login.form} t={t} fieldName="new_password" inputProps={{ type: "password" }} />
            <FormFieldTextInput
                form={login.form}
                t={t}
                fieldName="new_password_confirm"
                inputProps={{ type: "password" }}
            />
            <ToolbarSpacer flex={1} />
            <Layout
                display="flex"
                flexDirection="row"
                justifyContent="flex-end"
                alignItems="center"
                gap={tokens.spacingHorizontalM}
            >
                <Button
                    appearance="primary"
                    onClick={() => {
                        login.form.submitForm();
                    }}
                    disabled={disabled || !login.form.isValid}
                >
                    {t("btn_confirm_change_password")}
                </Button>
            </Layout>
        </Layout>
    );
};
