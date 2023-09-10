const path = require("path");

module.exports = {
    DEBUG: true,
    PORT: 4010,
    HELMET_OPTIONS: {
        contentSecurityPolicy: false
    },
    REDIS_PASSWORD: "secret",
    REDIS_PORT: 16385,
    SERVER_URL: "https://bff.local",
    PUBLIC_FOLDER: path.join(process.cwd(), "resources", "public")
};