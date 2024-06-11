import { ApiBuilder } from "@blendsdk/codegen";
import { createAuthenticationAPI } from "./auth";
import { createInitializeAPI } from "./initialize";
import { createUserProfileAPI } from "./profile";
import { createReferenceDataAPI } from "./ref";

export function defineCustomApi(builder: ApiBuilder) {
    createInitializeAPI(builder);
    createReferenceDataAPI(builder);
    createUserProfileAPI(builder);
    createAuthenticationAPI(builder);
}
