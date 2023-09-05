import { IRoute } from "@blendsdk/react";
import { LoginView, LogoutView } from "../authentication";
import { eAppRoutes } from "./constants";
import { SignInRedirect } from "../dashboard";

export const appRoutes: IRoute[] = [
    {
        name: eAppRoutes.signin.key,
        path: eAppRoutes.signin.path,
        component: LoginView
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
