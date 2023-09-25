/**
 * Describes a translation function containing custom parameters
 * @export
 */
export type TI18NCompositeFn = (parameters?: any, plural?: boolean) => string;

/**
 * Interface describing translations keys
 * @export
 */
export interface I18NKeys {
	LOGIN: string;
}
/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

/**
 * Enum of the type I18NKeys
 * @export
 * @enum
 */
export const eI18NKeys = {
	LOGIN: "login"
} as const;
export type eI18NKeys = (typeof eI18NKeys)[keyof typeof eI18NKeys];
