import { IRoute } from "@blendsdk/react";
import { AuthenticationView } from "../authentication";
import { LogoutView } from "../authentication/LogoutView";
import { eAppRoutes } from "./constants";

export const appRoutes: IRoute[] = [
    {
        name: eAppRoutes.dashboard.key,
        path: eAppRoutes.dashboard.path,
        component: () => {
            window.location.href = "/not-found";
            return null as any;
        }
    },
    {
        name: eAppRoutes.signin.key,
        path: eAppRoutes.signin.path,
        component: AuthenticationView
    },
    {
        name: eAppRoutes.signout.key,
        path: eAppRoutes.signout.path,
        component: LogoutView
    }
];
