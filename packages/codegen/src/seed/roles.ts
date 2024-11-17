import { DbSeeder, eEnumType, TEnumConfig, TInsertRecord } from "@blendsdk/codegen";
import { MD5 } from "@blendsdk/stdlib";
import { eSysRole, ISysRole } from "../types";

export class RolesSeeder extends DbSeeder<ISysRole> {
    getTableName(): string {
        return eSysRole.$name;
    }

    getEmumConfig(): TEnumConfig<ISysRole> {
        return {
            enumName: "roles",
            enumKey: "id",
            enumType: eEnumType.ENUM,
            enumValueKey: "role"
        };
    }

    normalizeRecord(record: Partial<ISysRole>): Partial<ISysRole> {
        record.id = MD5(record.role);
        return record;
    }

    prepareDbRecord(record: Partial<ISysRole>): TInsertRecord<ISysRole> {
        return {
            role: this.toDBString(record.role),
            description: this.toDBString(record.description),
            id: this.toUUID(record.id),
            is_active: record.is_active,
            is_system: record.is_system
        };
    }

    prepareEnumValue(record: Partial<ISysRole>): string | number {
        return this.toDBString(record.id);
    }
}

export const rolesSeeder = new RolesSeeder();
