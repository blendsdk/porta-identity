import { refType } from "@blendsdk/codegen";
import { database, typeSchema } from "./lib";
export const refOpsResponse = refType("ops_response");

export const ref_types = () => {
    const data = database
        .getTables()
        .filter((table) => {
            const { is_reference_table } = table.getMetaData();
            return is_reference_table === true;
        })
        .map((item) => {
            return item.getName();
        })
        .filter(Boolean);
    return data;
};

export function createCustomTypes(order: number) {
    if (order === 0) {
        // typeSchema
        //     .createAppendType("authentication_flow_state") //
        //     .addString("account", { optional: true })
        //     .addBoolean("account_status", { optional: true })
        //     .addBoolean("account_state", { optional: true })
        //     .addBoolean("password_state", { optional: true })
        //     .addString("signin_url", { optional: true })
        //     .addString("mfa_state", { optional: true })
        //     .addString("mfa_list", { array: true, optional: true });

        typeSchema
            //
            .createAppendType("ops_response")
            .addString("message")
            .addBoolean("success");
    } else {
        typeSchema
            .createAppendType("porta_account")
            .addRefType("user", "#/definitions/sys_user")
            // .addRefType("profile", "#/definitions/sys_user_profile")
            .addRefType("tenant", "#/definitions/sys_tenant");
    }
}
