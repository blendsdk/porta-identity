import { TranslationStoreBase, makeTranslator } from "@blendsdk/react";
import { ApplicationApi } from "../api/generated_api";
import { ITranslationDatabase } from "@blendsdk/i18n";

/**
 * Implements a translation store
 *
 * @export
 * @class I18TranslationStore
 * @extends {TranslationStoreBase}
 */
export class I18TranslationStore extends TranslationStoreBase {
    /**
     * @param {string} [locale]
     * @returns {Promise<ITranslationDatabase>}
     * @memberof I18TranslationStore
     */
    load(locale?: string): Promise<ITranslationDatabase> {
        return new Promise((resolve, reject) => {
            ApplicationApi.blend
                .getTranslations({
                    locale
                })
                .then(({ data }) => {
                    resolve(data);
                })
                .catch(reject);
        });
    }
}

export const useTranslation = makeTranslator(I18TranslationStore);
