import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { userStore, getSafeUser, UserRole } from "../supabase-auth-service"

/**
 * Extend NextAuth types
 */
declare module "next-auth" {
    interface Session {
        user: {
            id: string
            email: string
            name: string
            role: UserRole
        }
    }

    interface User {
        id: string
        email: string
        name: string
        role: UserRole
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string
        role: UserRole
    }
}

/**
 * NextAuth.js configuration
 */
export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email", placeholder: "admin@zeiega.com" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error("Email and password are required")
                }

                const user = await userStore.findByEmail(credentials.email)

                if (!user) {
                    throw new Error("Invalid email or password")
                }

                if (!user.isActive) {
                    throw new Error("Account is deactivated")
                }

                const isValidPassword = await userStore.verifyPassword(user, credentials.password)

                if (!isValidPassword) {
                    throw new Error("Invalid email or password")
                }

                // Record login time
                await userStore.recordLogin(user.id)

                // Return user object for session
                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                }
            },
        }),
    ],

    pages: {
        signIn: "/auth/login",
        signOut: "/auth/logout",
        error: "/auth/error",
    },

    session: {
        strategy: "jwt",
        maxAge: 24 * 60 * 60, // 24 hours
    },

    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id
                token.role = user.role
            }
            return token
        },

        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id
                session.user.role = token.role
            }
            return session
        },
    },

    events: {
        async signIn({ user }) {
            console.log(`✅ User signed in: ${user.email}`)
        },
        async signOut({ token }) {
            console.log(`👋 User signed out: ${token?.email}`)
        },
    },

    debug: process.env.NODE_ENV === "development",
}
