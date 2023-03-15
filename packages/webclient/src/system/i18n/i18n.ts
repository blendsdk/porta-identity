import { createTranslator } from "@blendsdk/react";
import { ApplicationApi, IApplicationI18NKeys } from "../api/generated_api";

/**
 * Creates a translator store to be used in this application
 *
 */
export const useTranslator = createTranslator<IApplicationI18NKeys>({
    loader: (locale:string) => {
        return new Promise((resolve, reject) => {
            ApplicationApi.blend
                .getTranslations({
                    locale: locale || (window.navigator as any).userLanguage || window.navigator.language
                })
                .then(({ data }) => {
                    resolve(data);
                })
                .catch(reject);
        });
    }
});
