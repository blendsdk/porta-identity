import { base64Encode } from "@blendsdk/stdlib";
const client_id = "1ffea3a9ad6608029e4610cfe77d5935bfc11cf8d819a29c2c77cef5ea9544de";
const client_secret = "e14282251b7bad07522748d2f053eac266ea1fcbab483cd6a092267795e5816d";
const basicAuth = base64Encode([client_id, client_secret].join(":"));

Bun.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const local = "https://porta.local/devreg/oauth2/me";
const remote = "https://dev.portaidentity.com/registry/oauth2/me"

const result = await fetch(remote, {
    headers: {
        Authorization: `Basic ${basicAuth}`
    }
});

console.log(JSON.stringify(await result.json(), null, 4));
