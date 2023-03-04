module.exports = {
    moduleFileExtensions: ["ts", "js"],
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            { tsconfig: 'tsconfig.json' },
        ],
    },
    testMatch: ["**/tests/**/*.test.(ts)"],
    testEnvironment: "node"
};
