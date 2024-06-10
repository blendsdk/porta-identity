import { IRoute } from "@blendsdk/react";
import { eSystemRoutes } from "./constants";
import { LoginView } from "../../application";

export const systemRoutes: IRoute[] = [
    {
        name: eSystemRoutes.login.key,
        path: eSystemRoutes.login.path,
        component: LoginView
    },
    {
        name: "not-authorized-access",
        path: "/not-authorized-access",
        component: () => {
            return "Not Authenticated" as any;
        }
    }
];
