import { DbSeeder, TEnumConfig, TInsertRecord } from "@blendsdk/codegen";
import { eSysApplication, ISysApplication } from "../types";

export class ApplicationSeeder extends DbSeeder<ISysApplication> {
    getTableName(): string {
        return eSysApplication.$name;
    }

    getEmumConfig(): TEnumConfig<ISysApplication> {
        return null;
    }

    normalizeRecord(record: Partial<ISysApplication>): Partial<ISysApplication> {
        return record;
    }

    prepareDbRecord(record: Partial<ISysApplication>): TInsertRecord<ISysApplication> {
        const { application_name, client_id, tenant_id, id, description, is_active, is_system, ow_consent, logo } =
            record;
        return {
            id: this.toUUID(id),
            application_name: this.toDBString(application_name),
            client_id: this.toDBString(client_id),
            tenant_id: this.toUUID(tenant_id),
            description: this.toDBString(description),
            is_active,
            is_system,
            ow_consent,
            logo: this.toDBString(logo)
        };
    }
    prepareEnumValue(_record: Partial<ISysApplication>): string | number {
        throw new Error("Method not implemented.");
    }
}

export const applicationSeeder = new ApplicationSeeder();
