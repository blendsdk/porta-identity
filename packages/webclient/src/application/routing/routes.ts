import { IRoute } from "@blendsdk/react";
import { AuthenticationView } from "../authentication";
import { LogoutView } from "../authentication/LogoutView";
import { eAppRoutes } from "./constants";
import { Dashboard, SignInRedirect } from "../dashboard";

export const appRoutes: IRoute[] = [
    {
        name: eAppRoutes.dashboard.key,
        path: eAppRoutes.dashboard.path,
        component: Dashboard
    },
    {
        name: eAppRoutes.signin.key,
        path: eAppRoutes.signin.path,
        component: AuthenticationView
    },
    {
        name: eAppRoutes.signinRedirect.key,
        path: eAppRoutes.signinRedirect.path,
        component: SignInRedirect
    },
    {
        name: eAppRoutes.signout.key,
        path: eAppRoutes.signout.path,
        component: LogoutView
    }
];
