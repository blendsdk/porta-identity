import { Body2, Subtitle2 } from "@blendsdk/fui8";
import { AccessDeniedIcon, Router, SessionProvider, SystemError, getCurrentLocale } from "@blendsdk/react";
import { mergeStyles } from "@fluentui/react";
import { useCallback, useEffect, useMemo } from "react";
import { createRbacFilter } from "../application/common/rbac";
import { appRoutes } from "../application/routing";
import { useReferenceData } from "../lib";
import { useTranslation } from "./i18n";
import "./session";
import { useRouter, useSystemError } from "./session";
import { useAppTheme } from "./theme";

/**
 * Make the body and root height to fill the screen
 */
mergeStyles({
    selectors: {
        ":global(body), :global(html), :global(#root)": {
            margin: 0,
            padding: 0,
            height: "100vh",
            "-webkit-font-smoothing": "antialiased",
            "-moz-osx-font-smoothing": "grayscale",
            position: "relative"
        },
        ":global(iframe)": {
            zIndex: "-99999999 !important"
        },
        ":global(*)": {
            boxShadow: "border-box"
        },
        ":global(.yarl__root)": {
            fontFamily: "var(--fonts_medium_font_family)"
        }
    }
});

const AccessDeniedContent = () => {
    const { t } = useTranslation();
    return <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Subtitle2 style={{ textAlign: "center" }}>{t("access_denied")}</Subtitle2>
        <Body2 style={{ textAlign: "center" }}>{t("no_permissions1")}</Body2>
        <Body2 style={{ textAlign: "center" }}>{t("no_permissions2")}</Body2>
    </div>;
};

const getThemeName = () => {
    if (window.location.host.startsWith("local")) {
        return "prod";
    } else if (window.location.host.startsWith("dev.")) {
        return "dev";
    } else {
        return "prod";
    }
};


/**
 * Index component that is going to load the application component
 * and the application theme
 */
export const Startup = () => {
    const { setTheme } = useAppTheme();
    const { catchSystemError } = useSystemError();
    const { translationStore } = useTranslation();
    const router = useRouter();
    const referenceData = useReferenceData();

    setTheme(getThemeName());

    // This is safe
    referenceData.serRouter(router);

    const loadTranslation = useCallback(() => {
        return translationStore.initialize(getCurrentLocale());
    }, [translationStore]);

    useEffect(() => {
        loadTranslation().catch(catchSystemError);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const rbacFilter = useMemo(() => {
        return createRbacFilter(referenceData);
    }, [referenceData]);


    return (
        <SessionProvider
            onBeforeStart={async () => {
                await loadTranslation().catch(catchSystemError);
            }}
            onSessionStarted={async () => {
                await referenceData.load().catch(catchSystemError);
            }}
        >
            <SystemError>
                <Router
                    routes={appRoutes}
                    unAuthorizedAccessView={
                        !referenceData.userProfile ? <div /> : <AccessDeniedIcon text={<AccessDeniedContent />} />}
                    onHandleAccessControl={(route) => {
                        return [route].filter(rbacFilter).length !== 0;
                    }}
                />
            </SystemError>
        </SessionProvider>
    );
};
