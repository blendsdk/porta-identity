import { CRC32 } from "@blendsdk/stdlib";

export async function getCommonKeySignature(): Promise<string> {
    return CRC32("bff-application");
}
