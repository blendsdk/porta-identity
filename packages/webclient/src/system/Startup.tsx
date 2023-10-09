import { eAclRuleType } from "@blendsdk/rbac";
import { AccessDeniedIcon, Router, SessionProvider, SystemError, getCurrentLocale } from "@blendsdk/react";
import { Body2, FluentProvider, Subtitle2 } from "@fluentui/react-components";
import { useEffect } from "react";
import { appRbacTable } from "../application/common/rbac";
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

    return (
        <FluentProvider theme={theme}>
            <SessionProvider
                onBeforeStart={async () => {
                    await translationStore.initialize(getCurrentLocale(router)).catch(catchSystemError);
                }}
                onSessionStarted={() => {
                    return new Promise<void>(async (resolve) => {
                        try {
                            await referenceData.load();
                            resolve();
                        } catch (err: any) {
                            catchSystemError(err);
                        }
                    });
                }}
            >
                <SystemError>
                    <Router
                        routes={appRoutes}
                        unAuthorizedAccessView={
                            <AccessDeniedIcon text={<AccessDeniedContent />} />}
                        onHandleAccessControl={(route) => {
                            return appRbacTable.check(route, referenceData.userProfile?.permissions || [], eAclRuleType.permission, { allRequired: true, passWhenNoRulePresent: true });
                        }}
                    />
                </SystemError>
            </SessionProvider>
        </FluentProvider>
    );
};
