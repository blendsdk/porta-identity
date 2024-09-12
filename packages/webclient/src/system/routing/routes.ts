import { IRoute } from "@blendsdk/react";
import { LoginView } from "../../application";
import { eSystemRoutes } from "./constants";

export const systemRoutes: IRoute[] = [
    {
        name: eSystemRoutes.login.key,
        path: eSystemRoutes.login.path,
        component: LoginView
    },
    // {
    //     name: eSystemRoutes.logout.key,
    //     path: eSystemRoutes.logout.path,
    //     component: LogoutView
    // },
    // {
    //     name: eSystemRoutes.logoutComplete.key,
    //     path: eSystemRoutes.logoutComplete.path,
    //     component: LogoutView
    // },
    {
        name: "not-authorized-access",
        path: "/not-authorized-access",
        component: () => {
            return "Not Authenticated" as any;
        }
    }
];
