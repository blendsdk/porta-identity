import { hashStringSync } from "@blendsdk/crypto";
import { isNullOrUndef } from "@blendsdk/stdlib";
import { ISysUser } from "@porta/shared";
import { SysUserDataServiceBase } from "./SysUserDataServiceBase";

/**
 * Provides functionality to manipulate the sys_user table
 * @export
 * @abstract
 * @class
 * @extends {SysUserDataServiceBase}
 */
export class SysUserDataService extends SysUserDataServiceBase {
    protected findSysUserByIdOutConverter(record: ISysUser): ISysUser {
        /**
         * Remove the password
         */
        record.password = undefined;
        return record;
    }

    protected insertIntoSysUserInConverter(record: ISysUser): ISysUser {
        record.password = hashStringSync(record.password);
        return record;
    }

    protected insertIntoSysUserOutConverter(record: ISysUser): ISysUser {
        /**
         * Remove the password
         */
        record.password = undefined;
        return record;
    }

    protected updateSysUserByIdInConverter(record: Partial<ISysUser>): Partial<ISysUser> {
        /**
         * Only update if the password is set again
         */
        if (!isNullOrUndef(record.password)) {
            record.password = hashStringSync(record.password);
        }
        return record;
    }

    protected updateSysUserByIdOutConverter(record: ISysUser): ISysUser {
        /**
         * Remove the password
         */
        record.password = undefined;
        return record;
    }
}
