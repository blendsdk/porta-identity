export const BASE_URL = `http://localhost:4010`;

export const getAuthEndpoint = (tenant?:string) => {
    return `${BASE_URL}/${tenant||"default"}/oauth2/authorize`;
}

export const getTokenEndpoint = (tenant?: string) => {
    return `${BASE_URL}/${tenant || "default"}/oauth2/token`;
};

export const authenticateUser = (auth?: { username?: string; password?: string }) => {
    return (options: Record<string, any>, responseDetails: { headers: Record<string, string> }) => {
        options.withCredentials = true;
        options.headers["Cookie"] = ((responseDetails.headers["set-cookie"] as any) || []).join(";");
        options.headers.signin = Buffer.from(JSON.stringify(auth || {})).toString("base64");
    };
};
