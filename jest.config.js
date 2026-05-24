/** @type {import('jest').Config} */
const config = {
    displayName: "accounting-system",
    testEnvironment: "node",
    transform: {
        "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
    },
    testMatch: [
        "**/__tests__/**/*.test.ts",
        "**/__tests__/**/*.test.tsx",
    ],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
    },
    setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
    collectCoverageFrom: [
        "lib/**/*.ts",
        "app/api/**/*.ts",
        "!lib/types.ts",
        "!**/*.d.ts",
    ],
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50,
        },
    },
    testTimeout: 30000,
    verbose: true,
}

module.exports = config
