import { base64Encode } from "@blendsdk/stdlib";
const client_id = "1ffea3a9ad6608029e4610cfe77d5935bfc11cf8d819a29c2c77cef5ea9544de";
const client_secret = "b9be3e6eaa9138bf200ab2fce32e6bed8587e43348f066cf79c6b5afe210c391";
const basicAuth = base64Encode([client_id, client_secret].join(":"));

Bun.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const result = await fetch("https://porta.local/devreg/oauth2/me", {
    headers: {
        Authorization: `Basic ${basicAuth}`
    }
});

console.log(JSON.stringify(await result.json(), null, 4));
