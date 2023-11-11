export const eAppRoutes = {
    signin: {
        key: "signin",
        path: "/fe/auth/signin"
    },
    signout: {
        key: "signout",
        path: "/fe/auth/signout"
    },
    forgotPassword: {
        key: "forgotPassword",
        path: "/fe/auth/forgot-password"
    },
    resetPassword: {
        key: "resetPassword",
        path: "/fe/auth/reset-password/:flow/t"
    },
    noValidSession: {
        key: "no-valid-session",
        path: "/fe/auth/session-expired"
    },
    signoutComplete: {
        key: "signout-complete",
        path: "/fe/auth/:tenant/signout/complete"
    },
    myProfile: {
        key: "me",
        path: "/fe/auth/:tenant/me"
    },
    tenantDashboard: {
        key: "tenant-dashboard",
        path: "/fe/manage/:tenant/dashboard"
    },
    tenants: {
        key: "tenants-admin",
        path: "/fe/manage/:tenant/tenants"
    },
    admin: {
        key: "admin",
        path: "/fe/manage/:tenant/admin"
    },
    applications: {
        key: "tenant-applications",
        path: "/fe/manage/:tenant/admin/applications"
    },
    roles: {
        key: "tenant-applications",
        path: "/fe/manage/:tenant/admin/roles"
    },
    permissions: {
        key: "tenant-applications",
        path: "/fe/manage/:tenant/admin/permissions"
    }
};
