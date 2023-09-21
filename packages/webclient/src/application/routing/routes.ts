import { IRoute } from "@blendsdk/react";
import { LoginView, LogoutView } from "../authentication";
import { eAppRoutes } from "./constants";
import { SignInRedirect } from "../dashboard";
import { ForgotPassword } from "../authentication/ForgotPassword";
import { ResetPassword } from "../authentication/ResetPassword";

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
    },
    {
        name: eAppRoutes.forgotPassword.key,
        path: eAppRoutes.forgotPassword.path,
        component: ForgotPassword
    },
    {
        name: eAppRoutes.resetPassword.key,
        path: eAppRoutes.resetPassword.path,
        component: ResetPassword
    },
    {
        name: eAppRoutes.root.key,
        path: eAppRoutes.root.path,
        component: () => {
            return "hello" as any;
        }
    }
];
