import { DefaultSystemErrorStore, makeRouter, makeSession, makeSystemError } from "@blendsdk/react";
import { SessionStore } from "../session";
import { makeTheme } from "@blendsdk/fui9";

export const useSystemError = makeSystemError(DefaultSystemErrorStore, {
});
export const useSession = makeSession(SessionStore);
export const useRouter = makeRouter();
export const useApplicationTheme = makeTheme();