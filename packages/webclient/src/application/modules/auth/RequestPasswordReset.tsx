import { FormFieldTextInput, Layout, ToolbarSpacer } from "@blendsdk/fui9";
import { Body1, Button, tokens } from "@fluentui/react-components";
import React from "react";
import { useTranslation } from "../../../system";
import { LoginViewLogic } from "./LoginViewLogic";
import { useStyles } from "./styles";

export interface IRequestPasswordReset {
    login: LoginViewLogic;
    disabled?: boolean;
}

export const RequestPasswordReset: React.FC<IRequestPasswordReset> = ({ disabled, login }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    return (
        <Layout className={styles.page} display="flex" flex={1} flexDirection="column" gap={tokens.spacingVerticalM}>
            {!login.requestResetPasswordSent && (
                <>
                    <Body1 className={styles.info}>{t("rest_password_request_message")}</Body1>
                    <FormFieldTextInput
                        fieldLabel={t("username_or_email")}
                        fieldName="username"
                        form={login.form}
                        t={t}
                    />
                </>
            )}
            {login.requestResetPasswordSent && (
                <>
                    <ToolbarSpacer flex={1} />
                    <Body1>{t("reset_password_request_sent")}</Body1>
                    <ToolbarSpacer flex={1} />
                </>
            )}
            {!login.requestResetPasswordSent && (
                <>
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
                            onClick={login.form.submitForm}
                            disabled={disabled || !login.form.isValid}
                        >
                            {t("btn_submit")}
                        </Button>
                    </Layout>
                </>
            )}
        </Layout>
    );
};
