import { ErrorDialog } from "@blendsdk/fluentrc";
import { clearAllCookies, initializeRouter, initializeSession, initializeSystemError } from "@blendsdk/react";
import { eAppRoutes } from "../../application/routing";
// TODO: fix theme
//import { useTheme } from "../../application/theme";
import { ApplicationApi } from "../api";

export const getBaseUrl = () => {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}${hostname.toLowerCase().indexOf("localhost") !== -1 ? ":4000" : ""}`;
};

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

initializeSystemError({
    errorView: ErrorDialog,
    errorViewCustomParams: () => {
        return {
            //TODO: check what should come here!
        };
    },
    isError: (error: any) => {
        if (error?.name === "UNAUTHORIZED_ACCESS") {
            clearAllCookies();
            return false;
        }
        return true;
    }
});

initializeRouter();

initializeSession({
    refreshSession: () => {
        throw Error("refreshSession is not implemented yet");
    },
    loginRoute: eAppRoutes.signin.path,
    startRoute: eAppRoutes.dashboard.path
});
