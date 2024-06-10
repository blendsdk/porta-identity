import { useObjectState } from "@blendsdk/react";
import { useEffect } from "react";
import { useRouter } from "../../../system";

export interface IUseAuthenticationFlowState {
    flowId: string;
    fetching: boolean;
}

export const useAuthenticationFlow = () => {
    const [state, setState] = useObjectState<Partial<IUseAuthenticationFlowState>>(() => ({
        flowId: null,
        fetching: true
    }));
    const router = useRouter();

    useEffect(() => {

        setState({ fetching: true });
        const { flow_id } = router.getParameters<{ flow_id: string; }>();
        setTimeout(() => {
            setState({ fetching: false, flowId: flow_id });
        }, 2000);

    }, []);
    return state;
};