import { Body2, makeStyles, mergeClasses, shorthands, Subtitle1, tokens } from "@fluentui/react-components";
import Cookies from "js-cookie";
import React, { Fragment, useMemo } from "react";
import { ContactCard32Regular, PersonAccounts24Regular } from "@fluentui/react-icons";
import { useTranslation } from "../../system/i18n";
import { IExistingAccount } from "./lib";

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        ...shorthands.margin(tokens.spacingVerticalL, 0),
        ...shorthands.gap("-1px")
    },
    button: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "transparent",
        cursor: "pointer",
        ...shorthands.borderColor(tokens.colorBrandBackground),
        ...shorthands.borderWidth("1px"),
        ...shorthands.gap("1rem"),
        ...shorthands.padding(tokens.spacingHorizontalM),
        ...shorthands.outline("none"),
        ...shorthands.borderStyle("dotted", "none", "none", "none"),
        ":nth-last-child(1)": {
            ...shorthands.borderStyle("dotted", "none", "dotted", "none")
        },
        ":hover": {
            backgroundColor: tokens.colorNeutralBackground1Hover
        }
    },
    icon: {
        width: "32px",
        height: "32px",
        color: tokens.colorBrandBackground
    },
    caption: {}
});

/**
 * Interface for configuring the PickAccount component
 *
 * @export
 * @interface IPickAccounts
 */
export interface IPickAccounts {
    accounts: IExistingAccount[];
    onSelect: (item: IExistingAccount) => void;
}

/**
 * PickAccount component
 */
export const PickAccounts: React.FC<IPickAccounts> = ({ accounts, onSelect }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    const list = useMemo<IExistingAccount[]>(() => {
        return [
            ...accounts,
            {
                account: t("use_another_account"),
                tenant: null as any
            }
        ];
    }, [accounts, t]);

    const lastTenant = useMemo(() => {
        return Cookies.get("_at");
    }, []);

    return (
        <Fragment>
            <Subtitle1>{t("signin_caption")}</Subtitle1>
            <div className={styles.root}>
                {list
                    .filter((i) => i.tenant === lastTenant || i.tenant === "default" || i.tenant === null)
                    .map((item) => {
                        return (
                            <button
                                className={mergeClasses(styles.button)}
                                key={item.account}
                                onClick={() => onSelect(item)}
                            >
                                {item.tenant ? (
                                    <PersonAccounts24Regular className={styles.icon} />
                                ) : (
                                    <ContactCard32Regular className={styles.icon} />
                                )}
                                <Body2 className={styles.caption}>{item.account}</Body2>
                            </button>
                        );
                    })}
            </div>
        </Fragment>
    );
};
