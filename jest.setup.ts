// Jest setup file
import "@testing-library/jest-dom"

// Mock Firebase Admin SDK
jest.mock("firebase-admin/app", () => ({
    initializeApp: jest.fn(),
    getApps: jest.fn(() => []),
    cert: jest.fn(() => ({})),
}))

jest.mock("firebase-admin/firestore", () => {
    const mockDocRef = {
        get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
    }

    const mockCollection = {
        doc: jest.fn(() => mockDocRef),
        add: jest.fn().mockResolvedValue({ id: "test-id" }),
        get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
    }

    return {
        getFirestore: jest.fn(() => ({
            collection: jest.fn(() => mockCollection),
            batch: jest.fn(() => ({
                set: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
                commit: jest.fn().mockResolvedValue({}),
            })),
        })),
    }
})

// Set up environment variables for testing
process.env.FIREBASE_PROJECT_ID = "test-project"
process.env.FIREBASE_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com"
process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----"
process.env.WEBHOOK_SECRET = "test-secret"
process.env.ALLOWED_ORIGINS = "http://localhost:3000"

// Global test utilities
global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}
