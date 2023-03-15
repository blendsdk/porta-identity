import { Router, Session, SystemError } from "@blendsdk/react";
import { useMemo } from "react";
import { loadUserProfile } from "../application/api";
import { useTranslator } from "./i18n";
import { appRoutes } from "../application/routing";
import { FluentProvider, teamsLightTheme } from "@fluentui/react-components";
import "./session";

/**
 * Index component that is going to load the application component
 * and the application theme
 */
export const Startup = () => {
    const translator = useTranslator();

    const routes = useMemo(() => {
        return [...appRoutes];
    }, []);

    return (
        <FluentProvider theme={teamsLightTheme}>
            <Session
                onBeforeStart={() => {
                    return translator.load();
                }}
                onLoadUserProfile={loadUserProfile}
            >
                <SystemError>
                    <Router routes={routes} />
                </SystemError>
            </Session>
        </FluentProvider>
    );
};
