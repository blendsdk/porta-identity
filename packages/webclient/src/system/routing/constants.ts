export const eSystemRoutes = {
    login: {
        path: "/fe/auth/:tenant/:flow_id/signin",
        key: "login"
    },
    logout: {
        key: "logout",
        path: "/fe/auth/:tenant/signout"
    }
};
