const path = require("path");

module.exports = {
    DEBUG: true,
    PORT: 4000,
    HELMET_OPTIONS: {
        contentSecurityPolicy: false
    },
    PUBLIC_FOLDER: path.join(process.cwd(), "resources", "public"),
    REDIS_HOST: "host.docker.internal",
    REDIS_PASSWORD: "secret",
    REDIS_PORT: 16385,
    DB_HOST: "host.docker.internal",
    DB_PORT: 5010,
    DB_USER: "porta",
    DB_PASSWORD: "secret",
    DB_DATABASE: "porta",
    PORTA_SESSION_LENGTH: 3 * 24 * 60 * 60, // 3 days
    PORTA_ADMIN: "admin@blendsdk.net",
    PORTA_PASSWORD: "secret",
    PORTA_SIGNIN_URI: "https://porta.local/fe/auth/signin",
    PORTA_SSO_COMMON_NAME: "porta_development",
    ENFORCE_PKCE: false
};