import { Body1, makeStyles, shorthands, Subtitle1, Title2, Title3, tokens } from "@fluentui/react-components";
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
            textAlign: "center",
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

export const InvalidSession: React.FC = () => {
    const { translate } = useTranslator();
    const styles = useStyles();

    return (
        <div className={styles.root}>
            <div className={styles.header}>
                <Warning24Regular className={styles.warnIcon} />
                <Subtitle1 className="subtitle">{translate("invalid_auth_session_caption")}</Subtitle1>
            </div>
            <Body1 className={styles.body}>{translate("invalid_auth_session_text")}</Body1>
        </div>
    );
};
