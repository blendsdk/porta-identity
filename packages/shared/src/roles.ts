import { MD5 } from "@blendsdk/stdlib";
import { ISysPermission, ISysRole } from "./types";

/**
 * @export
 * @interface ISystemRoles
 */
export interface ISystemRoles {
    USER: ISysRole;
    ADMINISTRATOR: ISysRole;
    REGISTRY_OWNER: ISysRole;
    TENANT_OWNER: ISysRole;
}

/**
 * @export
 * @interface ISystemPermissions
 */
export interface ISystemPermissions {
    DEFAULT: ISysPermission;
}

export const eSystemRoles: ISystemRoles = {
    USER: {
        id: MD5("user"),
        role: "USER",
        description: "System User",
        is_active: true,
        is_system: true
    },
    ADMINISTRATOR: {
        id: MD5("administrator"),
        role: "ADMINISTRATOR",
        description: "System Administrator",
        is_active: true,
        is_system: true
    },
    REGISTRY_OWNER: {
        id: MD5("registry_owner"),
        role: "REGISTRY_OWNER",
        description: "System Registry Owner",
        is_active: true,
        is_system: true
    },
    TENANT_OWNER: {
        id: MD5("tenant_owner"),
        role: "TENANT_OWNER",
        description: "Tenant Owner Role",
        is_active: true,
        is_system: true
    }
};

export const eSystemPermissions: ISystemPermissions = {
    DEFAULT: {
        id: MD5("default"),
        permission: "DEFAULT",
        application_id: null,
        description: "Default System Permission",
        is_active: true,
        is_system: true
    }
};

/**
 * @export
 * @param {ISysRole} role
 * @param {ISysRole[]} roles
 * @return {*}
 */
export function hasRole(role: ISysRole, roles: ISysRole[]) {
    return roles.find((r) => r.id.replace(/-/gi, "").toUpperCase() === role.id.toUpperCase());
}

/**
 * @export
 * @param {ISysPermission} permission
 * @param {ISysPermission[]} permissions
 * @return {*}
 */
export function hasPermission(permission: ISysPermission, permissions: ISysPermission[]) {
    return permissions.find(
        (r) => r.id.replace(/-/gi, "").toUpperCase() === permission.id.replace(/-/gi, "").toUpperCase()
    );
}
