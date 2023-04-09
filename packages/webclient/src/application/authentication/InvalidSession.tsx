import { Body1, makeStyles, shorthands, Subtitle1, tokens } from "@fluentui/react-components";
import React from "react";
import { useTranslator } from "../../system/i18n";
import { Warning24Regular } from "@fluentui/react-icons";

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        ...shorthands.gap(tokens.spacingVerticalL)
    },
    header: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        ...shorthands.gap(tokens.spacingVerticalL),
        "& .subtitle": {
            ...shorthands.flex(1)
        }
    },
    body: {
        //...shorthands.margin(tokens.spacingVerticalL, 0),
        ...shorthands.padding("0.2rem", "0.3rem")
    },
    warnIcon: {
        color: tokens.colorPaletteRedForeground1,
        width: "2.5rem",
        height: "2.5rem"
    }
});

export const InvalidSession: React.FC<{ logout?: boolean }> = ({ logout }) => {
    const { translate } = useTranslator();
    const styles = useStyles();

    return (
        <div className={styles.root}>
            <div className={styles.header}>
                <Warning24Regular className={styles.warnIcon} />
                <Subtitle1 className="subtitle">
                    {translate(logout ? "invalid_logout_session_caption" : "invalid_auth_session_caption")}
                </Subtitle1>
            </div>
            <Body1 className={styles.body}>
                {translate(logout ? "invalid_logout_session_text" : "invalid_auth_session_text")}
            </Body1>
        </div>
    );
};
