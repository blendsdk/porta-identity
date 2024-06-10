import { ApiBuilder } from "@blendsdk/codegen";
import { createAuthenticationAPI } from "./auth";
import { createExtensionAPI } from "./extension";
import { createInitializeAPI } from "./initialize";
import { createUserProfileAPI } from "./profile";
import { createReferenceDataAPI } from "./ref";

export function defineCustomApi(builder: ApiBuilder) {
    createExtensionAPI(builder);
    createInitializeAPI(builder);
    createReferenceDataAPI(builder);
    createUserProfileAPI(builder);
    createAuthenticationAPI(builder);

}
