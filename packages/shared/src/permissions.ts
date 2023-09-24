import { MD5 } from "@blendsdk/stdlib";
import { ISysGroup, ISysPermission } from "./types";

export const eDefaultSystemGroups = {
    USERS_GROUP: {
        id: MD5("all_users"),
        description: "all_users",
        name: "all_users",
        is_active: true,
        group_type: "S"
    } as ISysGroup,
    ADMINISTRATORS_GROUP: {
        id: MD5("system_administrators"),
        description: "system_administrators",
        name: "system_administrators",
        is_active: true,
        group_type: "S"
    } as ISysGroup,
    API_GROUP: {
        id: MD5("system_api"),
        description: "system_api",
        name: "system_api",
        is_active: true,
        group_type: "S"
    } as ISysGroup
};

export const eDefaultPermissions = {
    CAN_CREATE_TENANT: {
        id: MD5("CAN_CREATE_TENANT"),
        code: "CAN_CREATE_TENANT",
        description: "permission_to_create_a_new_tenant"
    } as ISysPermission,
    GROUP_PERMISSION: {
        id: MD5("GROUP_PERMISSION"),
        code: "GROUP_PERMISSION",
        description: "permission_to_be_part_of_a_group"
    } as ISysPermission
};
