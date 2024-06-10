import { IExtensionState, makeExtension, makePlaceholderExtension } from "@blendsdk/react";
import { ApplicationApi } from "../../system";
import { ITestExtension } from "./extension_types";

export let useTestExtension: () => IExtensionState & ITestExtension = makePlaceholderExtension();

export function create_extension() {
    useTestExtension = makeExtension<ITestExtension>({
        extension: (provider) => {
            return provider.find(({ name }) => {
                return name === "test";
            });
        },
        params: {
            applicationApi: ApplicationApi
        }
    });
}
