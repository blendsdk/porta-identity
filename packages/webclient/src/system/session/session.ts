import { DefaultSystemErrorStore, makeRouter, makeSystemError } from "@blendsdk/react";
import { ApplicationApi } from "../api";
import { ErrorDialog, makeTheme } from "@blendsdk/fluentrc";
import { teamsLightTheme } from "@fluentui/react-components";

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

export const useAppTheme = makeTheme({
    onInit: (store) => {
        store.setTheme(teamsLightTheme);
    }
});

export const useSystemError = makeSystemError(DefaultSystemErrorStore, {
    CustomErrorDialog: ErrorDialog
});

export const useRouter = makeRouter();

//export const useSession = makeSession(SessionStore);
