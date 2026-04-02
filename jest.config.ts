import type { Config } from "jest"
import nextJest from "next/jest"

const createJestConfig = nextJest({
    // Provide the path to your Next.js app to load next.config.js and .env files
    dir: "./",
})

const config: Config = {
    displayName: "accounting-system",
    testEnvironment: "node",
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

export default createJestConfig(config)
