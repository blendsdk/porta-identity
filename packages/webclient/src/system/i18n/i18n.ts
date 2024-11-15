import { ITranslationDatabase } from "@blendsdk/i18n";
import { TranslationStoreBase, makeTranslator } from "@blendsdk/react";
import { ApplicationApi } from "../api";

const isLocalhost = true;
//TODO: Don't forget to remove this
//window.location.href.includes("localhost");

/**
 * Implements a translation store
 *
 * @export
 * @class I18TranslationStore
 * @extends {TranslationStoreBase}
 */
export class I18TranslationStore extends TranslationStoreBase {
    public constructor() {
        super();
        if (isLocalhost) {
            this.onMissingTranslation = (key: string) => {
                const win: any = window as any;
                if (!win.missing_i18n) {
                    win.missing_i18n = {};
                }
                win.missing_i18n[key] = true;
                win.make_missing_i18n = () => {
                    const result: any = {};
                    Object.keys(win.missing_i18n).forEach((key) => {
                        result[key] = {
                            en: "",
                            nl: ""
                        };
                    });

                    let check = 3;
                    const id = setInterval(() => {
                        check--;
                        if (check < 0) {
                            clearInterval(id);
                            navigator.clipboard.writeText(JSON.stringify(result, null, 4)).then(() => {
                                console.log(`${Object.keys(result).length} is copied to clipboard`);
                            });
                        } else {
                            console.log(check);
                        }
                    }, 1000);
                };
            };
        }
    }

    /**
     * @param {string} [locale]
     * @returns {Promise<ITranslationDatabase>}
     * @memberof I18TranslationStore
     */
    load(locale?: string): Promise<ITranslationDatabase> {
        return new Promise((resolve, reject) => {
            ApplicationApi.blend
                .getTranslations({ locale })
                .then(({ data }) => {
                    resolve(data);
                })
                .catch(reject);
        });
    }
}

export const useTranslation = makeTranslator(I18TranslationStore);
