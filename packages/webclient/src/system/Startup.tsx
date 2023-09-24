import { Router, SessionLoadingView, SystemError, getCurrentLocale } from "@blendsdk/react";
import { FluentProvider } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { appRoutes } from "../application/routing";
import { useTranslation } from "./i18n";
import "./session";
import { useAppTheme, useSystemError } from "./session";

/**
 * Index component that is going to load the application component
 * and the application theme
 */
export const Startup = () => {
    const { theme } = useAppTheme();
    const { catchSystemError } = useSystemError();
    const { translationStore } = useTranslation();
    const [ready, setReady] = useState<boolean>(false);
    useEffect(() => {
        const worker = new Promise<void>(async (resolve, reject) => {
            try {
                await translationStore.initialize(getCurrentLocale());
                setReady(true);
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
            <SystemError>{ready ? <Router routes={appRoutes} /> : <SessionLoadingView />}</SystemError>
        </FluentProvider>
    );
};
