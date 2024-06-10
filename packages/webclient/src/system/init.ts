import { DefaultSystemErrorStore, makeRouter, makeSession, makeSystemError } from "@blendsdk/react";
import { SessionStore } from "./SessionStore";
import { ErrorDialog } from "@blendsdk/fui8";

export const useSystemError = makeSystemError(DefaultSystemErrorStore, {
    CustomErrorDialog: ErrorDialog
});
export const useSession = makeSession(SessionStore);
export const useRouter = makeRouter();
