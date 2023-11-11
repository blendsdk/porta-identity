import { AccessDeniedIcon, Router, SessionProvider, SystemError, getCurrentLocale } from "@blendsdk/react";
import { Body2, FluentProvider, Subtitle2 } from "@fluentui/react-components";
import { useEffect, useMemo } from "react";
import { createRbacFilter } from "../application/common/rbac";
import { appRoutes } from "../application/routing";
import { useReferenceData } from "../lib";
import { useTranslation } from "./i18n";
import "./session";
import { useAppTheme, useRouter, useSystemError } from "./session";

const AccessDeniedContent = () => {
    const { t } = useTranslation();
    return <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Subtitle2 align="center">{t("access_denied")}</Subtitle2>
        <Body2 align="center">{t("no_permissions1")}</Body2>
        <Body2 align="center">{t("no_permissions2")}</Body2>
    </div>;
};

/**
 * Index component that is going to load the application component
 * and the application theme
 */
export const Startup = () => {
    const { theme } = useAppTheme();
    const { catchSystemError } = useSystemError();
    const { translationStore } = useTranslation();
    const router = useRouter();
    const referenceData = useReferenceData();

    // This is safe
    referenceData.serRouter(router);

    useEffect(() => {
        const worker = new Promise<void>(async (resolve, reject) => {
            try {
                await translationStore.initialize(getCurrentLocale());
                resolve();
            } catch (err: any) {
                reject(err);
            }
        });
        worker.catch(catchSystemError);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const rbacFilter = useMemo(() => {
        return createRbacFilter(referenceData);
    }, [referenceData]);


    return (
        <FluentProvider theme={theme}>
            <SessionProvider
                onBeforeStart={async () => {
                    await translationStore.initialize(getCurrentLocale(router)).catch(catchSystemError);
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
        </FluentProvider>
    );
};
