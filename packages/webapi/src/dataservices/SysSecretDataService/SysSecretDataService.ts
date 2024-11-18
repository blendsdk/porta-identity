import { hashStringSync } from "@blendsdk/crypto";
import { isNullOrUndef } from "@blendsdk/stdlib";
import { ISysSecret } from "@porta/shared";
import { SysSecretDataServiceBase } from "./SysSecretDataServiceBase";

/**
 * Provides functionality to manipulate the sys_secret table
 * @export
 * @abstract
 * @class
 * @extends {SysSecretDataServiceBase}
 */
export class SysSecretDataService extends SysSecretDataServiceBase {
    /**
     * @protected
     * @param {ISysSecret} record
     * @return {*}  {ISysSecret}
     * @memberof SysSecretDataService
     */
    protected insertIntoSysSecretInConverter(record: ISysSecret): ISysSecret {
        record.secret = hashStringSync(record.secret);
        return record;
    }

    /**
     * @protected
     * @param {Partial<ISysSecret>} record
     * @return {*}  {Partial<ISysSecret>}
     * @memberof SysSecretDataService
     */
    protected updateSysSecretByIdInConverter(record: Partial<ISysSecret>): Partial<ISysSecret> {
        const rec: any = record;
        /**
         * Only update if the password is set again
         */
        if (!isNullOrUndef(rec.i_secret)) {
            rec.i_secret = hashStringSync(rec.i_secret);
        }
        rec.date_changed = new Date().toString();
        return rec;
    }
}
