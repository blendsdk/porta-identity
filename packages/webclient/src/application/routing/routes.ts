import { IRoute } from "@blendsdk/react";
import { LoginView, LogoutView } from "../authentication";
import { ForgotPassword } from "../authentication/ForgotPassword";
import { ResetPassword } from "../authentication/ResetPassword";
import { DashboardOverview } from "../dashboard/DashboardView";
import { SessionExpiredView } from "../dashboard/SessionExpred";
import { eAppRoutes } from "./constants";

export const appRoutes: IRoute[] = [
    {
        name: eAppRoutes.signin.key,
        path: eAppRoutes.signin.path,
        component: LoginView
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
        component: DashboardOverview
    },
    {
        name: eAppRoutes.noValidSession.key,
        path: eAppRoutes.noValidSession.path,
        component: SessionExpiredView
    }
];
