import { AccessDeniedIcon, Router, SessionProvider, SystemError, getCurrentLocale } from "@blendsdk/react";
import { useCallback, useEffect, useMemo } from "react";
import { AccessDeniedContent } from ".";
import { applicationRoutes, createRbacFilter, useApplication } from "../../application";
import { ApplicationApi } from "../api";
import { useTranslation } from "../i18n";
import { getBaseUrl, useRouter, useSystemError } from "../lib";
import { systemRoutes } from "../routing";

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
 * Index component that is going to load the application component
 * and the application theme
 */
export const Startup: React.FC = () => {
    const { catchSystemError } = useSystemError();
    const { translationStore } = useTranslation();
    const router = useRouter();
    const app = useApplication();

    // This is safe
    app.setRouter(router);

    const loadTranslation = useCallback(() => {
        const url = new URL(window.location.href);
        const key = "ui_locales";
        const search_ui_locales = url.searchParams.get(key);
        const last_ui_locales = window.localStorage.getItem(key);
        if (!last_ui_locales && search_ui_locales) {
            window.localStorage.setItem(key, search_ui_locales);
        }
        return translationStore.initialize(search_ui_locales || last_ui_locales || getCurrentLocale());
    }, [translationStore]);

    const rbacFilter = useMemo(() => {
        return createRbacFilter(app);
    }, [app]);

    useEffect(() => {
        loadTranslation().catch(catchSystemError);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const routes = useMemo(() => {
        return [...systemRoutes, ...applicationRoutes];
    }, []);

    return (
        <SessionProvider
            onBeforeStart={async () => {
                await loadTranslation().catch(catchSystemError);
            }}
            onSessionStarted={async () => {
                await app.load().catch(catchSystemError);
            }}
        >
            <SystemError>
                <Router
                    checkForSession
                    routes={routes}
                    unAuthorizedAccessView={
                        !app.userData ? <div /> : <AccessDeniedIcon text={<AccessDeniedContent />} />
                    }
                    onHandleAccessControl={(route) => {
                        return [route].filter(rbacFilter).length !== 0;
                    }}
                />
            </SystemError>
        </SessionProvider>
    );
};
