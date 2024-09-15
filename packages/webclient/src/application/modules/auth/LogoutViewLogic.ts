import { DataStoreBase, IInitStore, makeLocalStore, RouterStore, TTranslationFunction } from "@blendsdk/react";
import { COOKIE_AUTH_FLOW_TTL, FLOW_ERROR_INVALID, ILogoutFlowInfo } from "@porta/shared";
import Cookies from "js-cookie";
import { ApplicationApi, eSystemRoutes, useRouter, useTranslation } from "../../../system";

export enum eLogoutView {
    LOGOUT_REQUEST = 1,
    LOGOUT_CANCEL = 2,
    LOGOUT_COMPLETE = 3
}

export class LogoutViewLogic extends DataStoreBase {
    protected sessionChecker: any;
    protected state: ILogoutFlowInfo;

    public ready: boolean;
    public t: TTranslationFunction;
    public router: RouterStore;
    public isInavlidSession: boolean;
    public tenantName: string;
    public applicationName: string;
    public logo: string;
    public view: eLogoutView;

    public showControls: boolean;
    public showBrand: boolean;
    public showRequest: boolean;
    public showComplete: boolean;
    public showWaitSpinner: boolean;
    public showUserOptions: boolean;
    public showCancelLogout: boolean;
    public showLogoutComplete: boolean;

    /**
     * Creates an instance of LogoutViewLogic.
     * @memberof LogoutViewLogic
     */
    public constructor() {
        super();
        this.ready = false;
        this.showRequest = true;
        this.showComplete = false;
        this.showWaitSpinner = false;
        this.showUserOptions = false;
    }

    protected updateState(state?: ILogoutFlowInfo) {
        if (state) {
            this.state = state;
        }

        // make sure we have a state first
        if (this.state) {
            this.isInavlidSession = this.state.error && this.state.resp === FLOW_ERROR_INVALID;
            this.showControls = !this.isInavlidSession && this.fetching === false;
            this.showBrand = this.showControls;
            this.showWaitSpinner = !this.isInavlidSession && this.fetching === true;
            this.showUserOptions = !this.isInavlidSession && this.view == eLogoutView.LOGOUT_REQUEST;
            this.showCancelLogout = !this.isInavlidSession && this.view == eLogoutView.LOGOUT_CANCEL;
            this.showLogoutComplete = !this.isInavlidSession && this.view == eLogoutView.LOGOUT_COMPLETE;

            this.tenantName = this.state.organization;
            this.applicationName = this.state.application_name;
            this.logo = this.state.logo;
        }
    }

    /**
     * @protected
     * @memberof LogoutViewLogic
     */
    protected checkSession() {
        const sessionCookie = Cookies.get(COOKIE_AUTH_FLOW_TTL);
        if (!sessionCookie) {
            this.state = this.state || ({} as any);
            this.state.error = true;
            this.state.resp = FLOW_ERROR_INVALID;
            this.updateState(this.state);
            this.react();
        }
    }

    /**
     * @protected
     * @memberof LogoutViewLogic
     */
    protected async loadTenantInformation() {
        if (this.state === undefined && !this.fetching) {
            this.beginFetching();
            ApplicationApi.authorization
                .logoutFlowInfo({
                    update: null
                })
                .then(({ data }) => {
                    this.view =
                        this.router.getRouteName() == eSystemRoutes.logout.key
                            ? eLogoutView.LOGOUT_REQUEST
                            : eLogoutView.LOGOUT_COMPLETE;
                    this.updateState(data);
                    this.ready = true;
                    this.doneFetching();
                })
                .catch((err) => {
                    this.catchSystemError(err);
                    this.ready = true;
                    this.doneFetching();
                });
        }
    }

    /**
     * @protected
     * @memberof LogoutViewLogic
     */
    protected beginFetching(): void {
        super.beginFetching(() => {
            this.updateState();
        });
    }

    /**
     * @protected
     * @memberof LogoutViewLogic
     */
    protected doneFetching(): void {
        super.doneFetching(() => {
            this.updateState();
        });
    }

    /**
     * @memberof LogoutViewLogic
     */
    public onLogoutCancel() {
        this.view = eLogoutView.LOGOUT_CANCEL;
        this.doneFetching();
    }

    /**
     * @memberof LogoutViewLogic
     */
    public onProceedWithLogout() {
        this.view = undefined;
        this.beginFetching();
        this.router.go(this.state.finalize_url, {}, true);
    }

    /**
     * @param {IInitStore} params
     * @memberof LogoutViewLogic
     */
    public init(params: IInitStore): void {
        const { sideEffect } = params;
        const { t } = useTranslation();
        this.router = useRouter();
        this.t = t;

        this.makeAction<LogoutViewLogic>("onLogoutCancel");
        this.makeAction<LogoutViewLogic>("onProceedWithLogout");

        sideEffect(() => {
            this.loadTenantInformation();
            if (!this.sessionChecker) {
                this.sessionChecker = setInterval(() => {
                    this.checkSession();
                }, 1000);
            }
            return () => {
                if (this.sessionChecker) {
                    clearInterval(this.sessionChecker);
                }
            };
        }, []);
    }
}

export const useLogoutView = makeLocalStore<LogoutViewLogic>(LogoutViewLogic);
