import { useObjectState } from "@blendsdk/react";
import { ICheckSetFlow } from "@porta/shared";
import { useEffect } from "react";
import { ApplicationApi } from "../../../system";

export interface IUseAuthenticationFlowState extends ICheckSetFlow {
    fetching: boolean;
}

export const useAuthenticationFlow = () => {

    const [state, setState] = useObjectState<Partial<IUseAuthenticationFlowState>>(() => ({
        fetching: true,
    }));

    useEffect(() => {
        setState({ fetching: true });
        ApplicationApi.authorization.checkSetFlow({}).then(({ data }) => {
            setState({ fetching: false, ...data });
        }).catch(err => {
            setState({ fetching: false, ...err });
        });
    }, []);
    return state;
};