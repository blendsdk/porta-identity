import { IRoute } from "@blendsdk/react";
import { LoginView, LogoutView } from "../authentication";
import { ForgotPassword } from "../authentication/ForgotPassword";
import { ResetPassword } from "../authentication/ResetPassword";
import { DashboardOverview } from "../dashboard/DashboardView";
import { MyProfile } from "../dashboard/MyProfile";
import { SessionExpiredView } from "../dashboard/SessionExpred";
import { SignoutComplete } from "../dashboard/SignoutComplete";
import { TenantsOverview } from "../tenants";
import { eAppRoutes } from "./constants";

export const appRoutes: IRoute[] = [
    {
        name: eAppRoutes.tenants.key,
        path: eAppRoutes.tenants.path,
        component: TenantsOverview
    },
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
        name: eAppRoutes.noValidSession.key,
        path: eAppRoutes.noValidSession.path,
        component: SessionExpiredView
    },
    {
        name: eAppRoutes.tenantDashboard.key,
        path: eAppRoutes.tenantDashboard.path,
        component: DashboardOverview
    },
    {
        name: eAppRoutes.signoutComplete.key,
        path: eAppRoutes.signoutComplete.path,
        component: SignoutComplete
    },
    {
        name: eAppRoutes.myProfile.key,
        path: eAppRoutes.myProfile.path,
        component: MyProfile
    }
];
