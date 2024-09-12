import { tokens } from "@fluentui/react-components";
import { makeStyles, shorthands } from "@griffel/react";

export const useStyles = makeStyles({
    wrapper: {
        backgroundColor: tokens.colorNeutralStencil2,
        backgroundSize: "cover",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        "& form": {
            position: "relative",
            height: "100%"
        }
    },
    authView: {
        backgroundColor: tokens.colorBrandBackgroundInverted,
        display: "flex",
        flexDirection: "column",
        justifyContent: "start",
        boxSizing: "border-box",
        gap: tokens.spacingHorizontalM,
        ...shorthands.padding("1rem"),
        "@media only screen and (min-width: 600px)": {
            display: "flex",
            position: "absolute",
            width: "440px",
            minHeight: "300px",
            transform: "translate(-50%, -50%)",
            top: "50%",
            left: "50%",
            boxShadow: tokens.shadow8,
            borderRadius: "3px"
        },
        "@media only screen and (max-width: 600px)": {
            height: "100%",
            position: "relative"
        }
    },
    logo: {
        minHeight: "72px",
        maxHeight: "72px",
        height: "72px",
        backgroundRepeat: "no-repeat",
        backgroundSize: "contain",
        backgroundPositionX: "center",
        backgroundPositionY: "center"
    },
    brandText: {
        color: tokens.colorNeutralStroke1
    },
    page: {
        "& a": {
            ...shorthands.textDecoration("none"),
            ":hover": {
                ...shorthands.textDecoration("underline")
            }
        }
    },
    error: {
        borderRadius: tokens.borderRadiusMedium,
        marginTop: tokens.spacingVerticalS,
        padding: tokens.spacingVerticalS,
        textAlign: "center",
        backgroundColor: tokens.colorStatusDangerBackground2
    },
    warn: {
        borderRadius: tokens.borderRadiusMedium,
        marginTop: tokens.spacingVerticalS,
        padding: tokens.spacingVerticalS,
        textAlign: "center",
        backgroundColor: tokens.colorStatusWarningBackground2
    },
    center: {
        textAlign: "center"
    },
    fill: {
        flex: 1
    }
});
