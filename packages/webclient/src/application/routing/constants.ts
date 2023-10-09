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
    tenantDashboard: {
        key: "tenant-dashboard",
        path: "/fe/manage/:tenant/dashboard"
    },
    signoutComplete: {
        key: "signout-complete",
        path: "/fe/auth/:tenant/signout/complete"
    },
    myProfile: {
        key: "me",
        path: "/fe/auth/:tenant/me"
    }

};
