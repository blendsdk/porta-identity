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
    DB_USER: "postgres",
    DB_PASSWORD: "postgres",
    DB_DATABASE: "postgres",
    ACCESS_TOKEN_TTL: 60 * 60 * 3, // 4 hours
    REFRESH_TOKEN_TTL: 60 * 60 * 24 * 7, // one week,
    BYPASS_MFA_DAYS: 1, // 1 Day
    AUTH_SESSION_LENGTH_HOURS: 24,
    PORTA_PUBLIC_DOMAIN: "porta.local", // NO <---------------
    PORTA_SSO_COMMON_NAME: "porta_development",
    PORTA_REGISTRY_TENANT: "registry1",
    PORTA_API_KEY: "YFmDkzFRhyuKwL9L0OdB9XGX6SbwytqI6gL3rEupc1NlAaBePXpPh4LEGKTAqoT1",
    ENFORCE_PKCE: false,
    MFA_EMAIL_FROM: "no-reply@truesoftware.nl"
};