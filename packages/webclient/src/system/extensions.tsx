import { SessionLoadingView, extensionProvider } from "@blendsdk/react";
import * as fluentui from "@fluentui/react";
import Cookie from "js-cookie";
import React from "react";
import ReactDOM from "react-dom/client";
import { ApplicationApi } from "./api";
import { getTenant } from "./lib/utils";

/**
 * Loads the extension into the application
 *
 * @export
 * @param {() => void} createExtension
 * @return {*}  {Promise<ReactDOM.Root>}
 */
export async function loadExtensions(createExtension: () => void): Promise<ReactDOM.Root> {
    const root = ReactDOM.createRoot(document.getElementById("root")!);
    const has_session = Cookie.get("_session");
    if (has_session) {
        root.render(
            <React.StrictMode>
                <SessionLoadingView />
            </React.StrictMode>
        );

        extensionProvider.loadPackages({
            fluentui
        });

        const { data } = await ApplicationApi.extension.listExtension({
            ...getTenant()
        });
        data.forEach(item => {
            extensionProvider.addExtension(item.source);
        });

        createExtension();
    }
    return root;
}
