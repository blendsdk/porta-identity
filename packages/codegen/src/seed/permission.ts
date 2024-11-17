import { DbSeeder, eEnumType, TEnumConfig, TInsertRecord } from "@blendsdk/codegen";
import { MD5 } from "@blendsdk/stdlib";
import { eSysRole, ISysPermission } from "../types";

export class PermissionSeeder extends DbSeeder<ISysPermission> {
    getTableName(): string {
        return eSysRole.$name;
    }

    getEmumConfig(): TEnumConfig<ISysPermission> {
        return {
            enumName: "permissions",
            enumKey: "id",
            enumType: eEnumType.ENUM,
            enumValueKey: "permission"
        };
    }

    normalizeRecord(record: Partial<ISysPermission>): Partial<ISysPermission> {
        record.id = MD5(record.permission);
        return record;
    }

    prepareDbRecord(record: Partial<ISysPermission>): TInsertRecord<ISysPermission> {
        return {
            permission: this.toDBString(record.permission),
            description: this.toDBString(record.description),
            id: this.toUUID(record.id),
            is_active: record.is_active,
            is_system: record.is_system
        };
    }

    prepareEnumValue(record: Partial<ISysPermission>): string | number {
        return this.toDBString(record.id);
    }
}

export const permissionSeeder = new PermissionSeeder();
