import { Body1, Input, makeStyles, shorthands, Subtitle1, tokens } from "@fluentui/react-components";
import { FormikProps } from "formik";
import React, { Fragment } from "react";
import { useTranslation } from "../../system/i18n";
import { IAuthenticationDialogModel, FIELD_SIZE } from "./lib";
import { useCheckFlowStore } from "./store";

export interface IGetMFA {
    form: FormikProps<IAuthenticationDialogModel>;
}

const useStyles = makeStyles({
    validation: {
        color: tokens.colorPaletteRedForeground1
    },
    mfa_wrapper: {
        display: "flex",
        flexDirection: "column",
        ...shorthands.gap(tokens.spacingVerticalM)
    },
    mfa_input: {
        "& input": {
            textAlign: "center",
            fontSize: "1.5rem",
            color: tokens.colorBrandBackground,
            fontWeight: "bold",
            "::placeholder": {
                fontSize: "initial",
                fontWeight: "normal"
            }
        }
    }
});

export const GetMFA: React.FC<IGetMFA> = ({ form }) => {
    const { t } = useTranslation();
    const styles = useStyles();
    const checkFlow = useCheckFlowStore();

    return (
        <Fragment>
            <Subtitle1>{t("mfa_caption")}</Subtitle1>
            <div className={styles.mfa_wrapper}>
                {checkFlow.mfa_list?.map((item) => {
                    const error = ((form.errors as any) || {})[`mfa_${item}`];
                    return (
                        <Fragment key={item}>
                            <Input
                                data-mfa={true}
                                className={styles.mfa_input}
                                size={FIELD_SIZE}
                                id={`mfa_${item}`}
                                name={`mfa_${item}`}
                                autoFocus
                                disabled={checkFlow.fetching}
                                onChange={form.handleChange}
                                value={(form.values as any)[`mfa_${item}`]}
                                type="text"
                                placeholder={t(`mfa_${item}_text_placeholder`)}
                            />
                            {error && <Body1 className={styles.validation}>{t(error)}</Body1>}
                        </Fragment>
                    );
                })}
            </div>
        </Fragment>
    );
};
