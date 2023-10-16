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
    CAN_MANAGE_ACCOUNTS: {
        id: MD5("CAN_MANAGE_ACCOUNTS"),
        code: "CAN_MANAGE_ACCOUNTS",
        description: "permission_to_manage_accounts"
    },
    CAN_MANAGE_ROLES: {
        id: MD5("CAN_MANAGE_ROLES"),
        code: "CAN_MANAGE_ROLES",
        description: "permission_to_manage_roles"
    },
    CAN_MANAGE_PERMISSIONS: {
        id: MD5("CAN_MANAGE_PERMISSIONS"),
        code: "CAN_MANAGE_PERMISSIONS",
        description: "permission_to_manage_permissions"
    },
    CAN_MANAGE_CLIENTS: {
        id: MD5("CAN_MANAGE_CLIENTS"),
        code: "CAN_MANAGE_CLIENTS",
        description: "permission_to_manage_clients"

    },
    CAN_MANAGE_TENANTS: {
        id: MD5("CAN_MANAGE_TENANTS"),
        code: "CAN_MANAGE_TENANTS",
        description: "permission_to_manage_tenants"
    } as ISysPermission,
    GROUP_PERMISSION: {
        id: MD5("GROUP_PERMISSION"),
        code: "GROUP_PERMISSION",
        description: "permission_to_be_part_of_a_group"
    } as ISysPermission
};
