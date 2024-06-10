import { AccessDeniedIcon, Router, SessionProvider, SystemError, getCurrentLocale } from "@blendsdk/react";
import { mergeStyles } from "@fluentui/react";
import { useCallback, useEffect, useMemo } from "react";
import { applicationRoutes, createRbacFilter } from "../application";
import { useApplication } from "../application/lib";
import { AccessDeniedContent } from "./AccessDeniedContent";
import { ApplicationApi } from "./api";
import { useTranslation } from "./i18n";
import { useRouter, useSystemError } from "./init";
import { getBaseUrl } from "./lib";
import { systemRoutes } from "./routing";
import { useAppTheme } from "./theme/themes";

ApplicationApi.setBaseUrl(getBaseUrl());

ApplicationApi.setSigningKey(() => {
    return new Promise<string>((resolve, reject) => {
        try {
            const value = Array.from(window.document.getElementsByTagName("meta"))
                .filter((el) => el.getAttribute("name") === "PageID")
                .map((el) => el.getAttribute("content"))[0];
            resolve(value || "");
        } catch (err: any) {
            reject(err);
        }
    });
});

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
export const Startup: React.FC = () => {
    const { setTheme } = useAppTheme();
    const { catchSystemError } = useSystemError();
    const { translationStore } = useTranslation();
    const router = useRouter();
    const appData = useApplication();


    setTheme(getThemeName());

    // This is safe
    appData.setRouter(router);


    const loadTranslation = useCallback(() => {
        return translationStore.initialize(getCurrentLocale());
    }, [translationStore]);

    const rbacFilter = useMemo(() => {
        return createRbacFilter(appData);
    }, [appData]);

    useEffect(() => {
        loadTranslation().catch(catchSystemError);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const routes = useMemo(() => {
        return [
            ...systemRoutes,
            ...applicationRoutes
        ];
    }, []);

    return <SessionProvider
        onBeforeStart={async () => {
            await loadTranslation().catch(catchSystemError);
        }}
        onSessionStarted={async () => {
            await appData.load().catch(catchSystemError);
        }}
    >
        <SystemError>
            <Router
                checkForSession
                routes={routes}
                unAuthorizedAccessView={
                    !appData.userData ? <div /> : <AccessDeniedIcon text={<AccessDeniedContent />} />}
                onHandleAccessControl={(route) => {
                    return [route].filter(rbacFilter).length !== 0;
                }}
            />
        </SystemError>
    </SessionProvider>;
};

