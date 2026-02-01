import NextAuth, { NextAuthOptions, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            username: string;
            displayName: string;
            role: string;
        };
    }
    interface User {
        id: string;
        username: string;
        displayName: string;
        role: string;
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id: string;
        username: string;
        role: string;
    }
}

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                username: { label: 'Username', type: 'text' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials): Promise<User | null> {
                if (!credentials?.username || !credentials?.password) {
                    return null;
                }

                const user = await prisma.user.findUnique({
                    where: { username: credentials.username },
                });

                if (!user || !user.isActive) {
                    return null;
                }

                const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
                if (!isValid) {
                    return null;
                }

                return {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    role: user.role,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.username = user.username;
                token.role = user.role;
            }
            return token;
        },
        async session({ session, token }) {
            session.user = {
                id: token.id,
                username: token.username,
                displayName: token.name || token.username,
                role: token.role,
            };
            return session;
        },
    },
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
