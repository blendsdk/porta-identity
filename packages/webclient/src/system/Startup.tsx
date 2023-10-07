import { Router, SessionProvider, SystemError, getCurrentLocale } from "@blendsdk/react";
import { FluentProvider } from "@fluentui/react-components";
import { useEffect } from "react";
import { appRoutes } from "../application/routing";
import { useReferenceData } from "../lib";
import { useTranslation } from "./i18n";
import "./session";
import { useAppTheme, useRouter, useSystemError } from "./session";

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
                onBeforeStart={() => {
                    return translationStore.initialize(getCurrentLocale(router)).catch(catchSystemError);
                }}
                onSessionStarted={() => {
                    return new Promise(async (resolve) => {
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
                        // unAuthorizedAccessView={<UNA />}
                        // onHandleAccessControl={(route, params) => {
                        //     console.log(ses.hasValidSession);
                        //     return route === eAppRoutes.suppliersOverview.key ? false : true;
                        // }}
                    />
                </SystemError>
            </SessionProvider>
        </FluentProvider>
    );
};
