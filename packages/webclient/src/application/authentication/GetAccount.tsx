import { Body1, Input, makeStyles, Subtitle1, tokens } from "@fluentui/react-components";
import { FormikProps } from "formik";
import React, { Fragment } from "react";
import { useTranslation } from "../../system/i18n";
import { FIELD_SIZE, IAuthenticationDialogModel } from "./lib";
import { useCheckFlowStore } from "./store";

export interface IGetAccount {
    form: FormikProps<IAuthenticationDialogModel>;
}

const useStyles = makeStyles({
    validation: {
        color: tokens.colorPaletteRedForeground1
    }
});

export const GetAccount: React.FC<IGetAccount> = ({ form }) => {
    const { t } = useTranslation();
    const styles = useStyles();
    const checkFlow = useCheckFlowStore();

    return (
        <Fragment>
            <Subtitle1>{t("signin_caption")}</Subtitle1>
            <Input
                size={FIELD_SIZE}
                id="username"
                name="username"
                disabled={checkFlow.fetching}
                autoFocus
                onChange={form.handleChange}
                value={form.values.username}
                placeholder={t("login_text_placeholder")}
            ></Input>
            {form.errors?.username && <Body1 className={styles.validation}>{t(form.errors?.username)}</Body1>}
        </Fragment>
    );
};
