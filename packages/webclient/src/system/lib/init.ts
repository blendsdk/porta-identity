import { ErrorDialog } from "@blendsdk/fui8";
import { DefaultSystemErrorStore, makeRouter, makeSession, makeSystemError } from "@blendsdk/react";
import { SessionStore } from "./SessionStore";

export const useSystemError = makeSystemError(DefaultSystemErrorStore, {
    CustomErrorDialog: ErrorDialog
});
export const useSession = makeSession(SessionStore);
export const useRouter = makeRouter();
