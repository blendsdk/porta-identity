const path = require("path");

module.exports = {
    DEBUG: true,
    PORT: 4000,
    HELMET_OPTIONS: {
        contentSecurityPolicy: false
    },
    PUBLIC_FOLDER: path.join(process.cwd(), "resources", "public"),
    REDIS_PASSWORD: "secret",
    REDIS_PORT: 16385,
    DB_HOST: "localhost",
    DB_PORT: 5010,
    DB_USER: "porta",
    DB_PASSWORD: "secret",
    DB_DATABASE: "porta",
    ACCESS_TOKEN_TTL: 60 * 60 * 4, // 4 hours
    REFRESH_TOKEN_TTL: 60 * 60 * 24 * 7, // one week,
    PORTA_ADMIN: "admin@blendsdk.net",
    PORTA_PASSWORD: "secret",
    PORTA_SIGNIN_URI: "https://porta.local/fe/auth/signin",
    PORTA_PUBLIC_DOMAIN: "porta.local",
    PORTA_SSO_COMMON_NAME: "porta_development",
    ENFORCE_PKCE: false,
    MFA_EMAIL_FROM: "no-reply@truesoftware.nl"
};