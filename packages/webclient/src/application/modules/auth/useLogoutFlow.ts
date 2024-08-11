import { useObjectState } from "@blendsdk/react";
import { ILogoutFlowInfo } from "@porta/shared";
import { useCallback, useEffect, useState } from "react";
import { ApplicationApi, useRouter, useTranslation } from "../../../system";

export interface IUseAuthenticationFlowState extends ILogoutFlowInfo {
    initializing: boolean;
    returningUser: boolean;
    fetching: boolean;
    curState: string;
}


let timeoutId: any = undefined;

interface ILogoutFlowState extends ILogoutFlowInfo {
    initializing: boolean;
    fetching: boolean;
    state: "end" | "keep" | "inital" | "complete";
}

export const useLogoutFlow = () => {
    const { t } = useTranslation();
    const router = useRouter();
    // const { catchSystemError } = useSystemError();
    const [reCheck, setReCheck] = useState(0);
    const [state, setState] = useObjectState<Partial<ILogoutFlowState>>(() => ({
        initializing: true,
        fetching: false,
        state: router.getRouteName() === "logout_complete" ? "complete" : "inital"
    }));

    useEffect(() => {
        setState({ initializing: true });
        ApplicationApi.authorization.logoutFlowInfo({}).then(({ data }) => {

            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            if (data.expires_in > 0) {
                timeoutId = setTimeout(() => {
                    setReCheck(reCheck + 1);
                }, data.expires_in);
            }
            setState(
                {
                    initializing: false,
                    ...data,
                }
            );
        }).catch(err => {
            setState({ initializing: false, error: err });
        });

        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reCheck]);

    const onProceedWithLogout = useCallback(() => {
        setState({ state: "end" });
        router.go(state.finalize_url, {}, true);
    }, [router, setState, state]);

    return { state, t, setState, onProceedWithLogout };
};