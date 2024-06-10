import { makeGlobalStore } from "@blendsdk/react";
import { StoreBase } from "./StoreBase";
import { IActorSearchView, IAppUser, IGetReferenceData } from "@castingappmt/shared";
import { ApplicationApi } from "../../system";
import { getTenant } from "../../system/utils";
import { base64Decode, base64Encode } from "@blendsdk/stdlib";

export interface ICurrentCasting {
    project_id: string;
    role_id: string;
}

export interface IUserState {
    actor_casting_details_collapsed: boolean;
    actor_personal_details_collapsed: boolean;
    actor_assessment_details_collapsed: boolean;
    actor_physical_details_collapsed: boolean;
    actor_other_details_collapsed: boolean;
    actor_visuals_details_collapsed: boolean;
    actor_email_details_collapsed: boolean;
    actor_phone_details_collapsed: boolean;
    actor_address_details_collapsed: boolean;
    actor_showreel_details_collapsed: boolean;
    actor_training_details_collapsed: boolean;
    actor_skill_details_collapsed: boolean;
    actor_document_details_collapsed: boolean;
    actor_agent_details_collapsed: boolean;
    //
    company_persons_details_collapsed: boolean;
    //
    project_details_collapsed: boolean;
    project_person_stakeholder_details_collapsed: boolean;
    project_company_stakeholder_details_collapsed: boolean;
    project_checklist_details_collapsed: boolean;
    project_team_member_details_collapsed: boolean;
    project_role_details_collapsed: boolean;
    //
    current_casting: ICurrentCasting;
}

/**
 * @export
 * @class ApplicationDataStore
 * @extends {StoreBase}
 */
export class ApplicationDataStore extends StoreBase {
    public openActorPreview: boolean = false;
    public actorToPreview: IActorSearchView;

    public setActorPreviewState(open: boolean, actorToPreview?: IActorSearchView) {
        this.openActorPreview = open;
        this.actorToPreview = actorToPreview;
        return this.react();
    }

    public userState: Partial<IUserState> = {};

    public userData: IAppUser;

    public refs: IGetReferenceData = {
        actorStatus: [],
        actorType: [],
        addressType: [],
        castingStatus: [],
        castingType: [],
        checklist: [],
        checklistType: [],
        chest: [],
        companyRoleType: [],
        country: [],
        ethnic: [],
        eye: [],
        gender: [],
        hair: [],
        neck: [],
        personRoleType: [],
        productionType: [],
        projectStatus: [],
        pronoun: [],
        shoe: [],
        skill: [],
        skillLevel: [],
        skillType: [],
        teamRoleType: [],
        training: [],
        visualType: [],
        waist: [],
        emailType: [],
        phoneType: [],
        agentType: []
    };
    /**
     * Loads the use profile
     *
     * @protected
     * @memberof ReferenceDataStore
     */
    protected async loadUserProfile() {
        const { data: userData } = await ApplicationApi.profile.getUserProfile({
            ...getTenant()
        });
        const { data: userStateData } = await ApplicationApi.profile.getUserState({
            ...getTenant()
        });
        this.userData = userData;
        this.userState = JSON.parse(base64Decode(userStateData.user_state));
    }

    public saveUserState(state: Partial<IUserState>) {
        return ApplicationApi.profile
            .saveUserState({
                ...getTenant(),
                user_state: base64Encode(JSON.stringify({ ...this.userState, ...state }))
            })
            .then(() => {
                this.userState = { ...this.userState, ...state };
                this.react();
            });
    }

    protected async loadMasterData() {
        const { data } = await ApplicationApi.referenceData.getReferenceData({
            ...getTenant()
        });
        this.refs = data;
    }

    /**
     * Load all reference data
     *
     * @memberof ReferenceDataStore
     */
    public async load() {
        this.beginFetching();
        await this.loadUserProfile();
        await this.loadMasterData();
        this.doneFetching();
    }
}

export const useApplication = makeGlobalStore(ApplicationDataStore);
