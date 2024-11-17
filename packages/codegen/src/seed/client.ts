import { DbSeeder, TEnumConfig, TInsertRecord } from "@blendsdk/codegen";
import { isNullOrUndef } from "@blendsdk/stdlib";
import { eSysClient, ISysClient } from "../types";

export class ClientSeeder extends DbSeeder<ISysClient> {
    getTableName(): string {
        return eSysClient.$name;
    }

    getEmumConfig(): TEnumConfig<ISysClient> {
        return null;
    }

    normalizeRecord(record: Partial<ISysClient>): Partial<ISysClient> {
        return record;
    }

    prepareDbRecord(record: Partial<ISysClient>): TInsertRecord<ISysClient> {
        const {
            id,
            application_id,
            access_token_length,
            refresh_token_length,
            is_active,
            is_system,
            mfa_bypass_days,
            mfa_id,
            redirect_uri,
            client_type,
            post_logout_redirect_uri,
            is_back_channel_post_logout
        } = record;
        return {
            id: this.toUUID(id),
            application_id: this.toUUID(application_id),
            client_type: this.toDBString(client_type),
            access_token_length,
            refresh_token_length,
            is_active,
            is_system,
            mfa_bypass_days,
            mfa_id: isNullOrUndef(mfa_id) ? "NULL" : this.toUUID(mfa_id),
            post_logout_redirect_uri: this.toDBString(post_logout_redirect_uri),
            redirect_uri: this.toDBString(redirect_uri),
            is_back_channel_post_logout
        };
    }

    public getMTRecordURL(server_url: string, tenant_name: string) {
        return {
            redirect_uri: `${server_url}/oidc/${tenant_name}/signin/callback`,
            post_logout_redirect_uri: `${server_url}/fe/auth/${tenant_name}/signout/complete`
        };
    }

    prepareEnumValue(_record: Partial<ISysClient>): string | number {
        throw new Error("Method not implemented.");
    }
}

export const clientSeeder = new ClientSeeder();
