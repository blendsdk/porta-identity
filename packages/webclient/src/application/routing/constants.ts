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
    root: {
        key: "root",
        path: "/fe/"
    },
    noValidSession: {
        key: "no-valid-session",
        path: "/fe/auth/session-expired"
    }
};
