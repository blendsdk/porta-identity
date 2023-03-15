import { Body1, Input, makeStyles, Subtitle1, tokens } from "@fluentui/react-components";
import { FormikProps } from "formik";
import React, { Fragment } from "react";
import { useTranslator } from "../../system/i18n";
import { IAuthenticationDialogModel } from "./types";

export interface IGetAccount {
    form: FormikProps<IAuthenticationDialogModel>;
}

const useStyles = makeStyles({
    validation: {
        color: tokens.colorPaletteRedForeground1
    }
});

export const GetAccount: React.FC<IGetAccount> = ({ form }) => {
    const { translate } = useTranslator();
    const styles = useStyles();

    return (
        <Fragment>
            <Subtitle1>{translate("signin_caption")}</Subtitle1>
            <Input
                id="username"
                name="username"
                autoFocus
                onChange={form.handleChange}
                value={form.values.username}
                placeholder={translate("login_text_placeholder")}
            ></Input>
            {form.errors?.username && <Body1 className={styles.validation}>{translate(form.errors?.username)}</Body1>}
        </Fragment>
    );
};
