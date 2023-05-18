import { Redirect } from "@blendsdk/react";
import Cookies from "js-cookie";

export const SignInRedirect = () => {
    const tenant = Cookies.get("_tenant");
    return <Redirect to={`/${tenant}/local/signin`} reload />;
};
