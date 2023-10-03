import { CRC32 } from "@blendsdk/stdlib";
import { HttpRequest } from "@blendsdk/webafx-common";

export interface IMTParams {
    tenant: string;
    PORTA_HOST: string;
}

export async function getKeySignature(req: HttpRequest) {
    const { tenant } = req.context.getParameters<IMTParams>();
    const { PORTA_HOST } = req.context.getSettings<IMTParams>();
    return CRC32<string>([PORTA_HOST, tenant].join(":"), { hexOutput: true });
}
