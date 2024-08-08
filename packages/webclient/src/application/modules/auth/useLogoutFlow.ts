import { useState } from "react";
import { useRouter, useSystemError, useTranslation } from "../../../system";

export interface IUseAuthenticationFlowState extends Ilogout {
    initializing: boolean;
    returningUser: boolean;
    fetching: boolean;
    curState: string;
}


export const useLogoutFlow = () => {
    const router = useRouter();
    const { t } = useTranslation();
    const { catchSystemError } = useSystemError();
    const [reCheck, setReCheck] = useState(0);
};