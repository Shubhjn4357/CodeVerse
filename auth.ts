import NextAuth, { type Session, type DefaultSession } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { client as db } from "@/lib/db";
import { randomUUID } from "crypto";
import type { Adapter, AdapterUser, AdapterAccount, AdapterSession, VerificationToken } from "@auth/core/adapters";
import { JWT } from "next-auth/jwt";
import { AUTH_CONFIG, ROUTES } from "@/constants";

/**
 * 🛰️ CodeVerse Authentication Core
 * Final Production-Grade Implementation (April 2026).
 * Enforces 100% strict typing, JWT strategy, and local bypass resilience.
 */

// --- 🧩 Type Augmentations ---
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      github_username?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    github_username?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    github_username?: string | null;
  }
}

/**
 * 🛠️ Extended Types for Adapter Internal Use
 */
interface CodeVerseAdapterUser extends AdapterUser {
  github_username?: string | null;
}

// LibSQL input value type for explicit casting
type LibSQLValue = string | number | bigint | boolean | Uint8Array | null;

// --- 🛠️ Custom Adapter Implementation ---
const TursoAdapter: Adapter = {
  async createUser(user: AdapterUser): Promise<AdapterUser> {
    const id = randomUUID();
    const github_username = (user as CodeVerseAdapterUser).github_username ?? null;
    
    await db.execute({
      sql: "INSERT INTO users (id, name, email, image, github_username) VALUES (?, ?, ?, ?, ?)",
      args: [id, user.name ?? null, user.email, user.image ?? null, github_username] as LibSQLValue[],
    });
    
    return { ...user, id };
  },

  async getUser(id: string): Promise<AdapterUser | null> {
    const res = await db.execute({
      sql: "SELECT * FROM users WHERE id = ?",
      args: [id] as LibSQLValue[],
    });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id as string,
      email: row.email as string,
      emailVerified: null,
      name: row.name as string | null,
      image: row.image as string | null,
    };
  },

  async getUserByEmail(email: string): Promise<AdapterUser | null> {
    const res = await db.execute({
      sql: "SELECT * FROM users WHERE email = ?",
      args: [email] as LibSQLValue[],
    });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id as string,
      email: row.email as string,
      emailVerified: null,
      name: row.name as string | null,
      image: row.image as string | null,
    };
  },

  async getUserByAccount({ providerAccountId, provider }: { providerAccountId: string; provider: string }): Promise<AdapterUser | null> {
    const res = await db.execute({
      sql: `SELECT u.* FROM users u 
            JOIN accounts a ON u.id = a.userId 
            WHERE a.providerAccountId = ? AND a.provider = ?`,
      args: [providerAccountId, provider] as LibSQLValue[],
    });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id as string,
      email: row.email as string,
      emailVerified: null,
      name: row.name as string | null,
      image: row.image as string | null,
    };
  },

  async updateUser(user: Partial<AdapterUser> & { id: string }): Promise<AdapterUser> {
    const res = await db.execute({
      sql: "SELECT name, email, image FROM users WHERE id = ?",
      args: [user.id] as LibSQLValue[],
    });
    if (res.rows.length === 0) throw new Error("User not found");
    const existing = res.rows[0];

    const name = user.name ?? (existing.name as string | null);
    const email = user.email ?? (existing.email as string);
    const image = user.image ?? (existing.image as string | null);

    await db.execute({
      sql: "UPDATE users SET name = ?, email = ?, image = ? WHERE id = ?",
      args: [name, email, image, user.id] as LibSQLValue[],
    });
    
    return {
      id: user.id,
      email: email,
      emailVerified: null,
      name: name,
      image: image,
    };
  },

  async deleteUser(userId: string): Promise<void> {
    await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [userId] as LibSQLValue[] });
  },

  async linkAccount(account: AdapterAccount): Promise<void> {
    await db.execute({
      sql: `INSERT INTO accounts (id, userId, provider, providerAccountId, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(), 
        account.userId, 
        account.provider, 
        account.providerAccountId,
        account.refresh_token ?? null, 
        account.access_token ?? null, 
        account.expires_at ?? null,
        account.token_type ?? null, 
        account.scope ?? null, 
        account.id_token ?? null, 
        account.session_state ?? null
      ] as LibSQLValue[],
    });
  },

  async unlinkAccount({ providerAccountId, provider }: { providerAccountId: string; provider: string }): Promise<void> {
    await db.execute({
      sql: "DELETE FROM accounts WHERE providerAccountId = ? AND provider = ?",
      args: [providerAccountId, provider] as LibSQLValue[],
    });
  },

  async createSession({ sessionToken, userId, expires }: { sessionToken: string; userId: string; expires: Date }): Promise<AdapterSession> {
    const id = randomUUID();
    await db.execute({
      sql: "INSERT INTO sessions (id, sessionToken, userId, expires) VALUES (?, ?, ?, ?)",
      args: [id, sessionToken, userId, expires.toISOString()] as LibSQLValue[],
    });
    return { sessionToken, userId, expires };
  },

  async getSessionAndUser(sessionToken: string): Promise<{ session: AdapterSession; user: AdapterUser } | null> {
    const res = await db.execute({
      sql: `SELECT s.sessionToken, s.userId, s.expires, u.id as u_id, u.name, u.email, u.image 
            FROM sessions s JOIN users u ON s.userId = u.id 
            WHERE s.sessionToken = ?`,
      args: [sessionToken] as LibSQLValue[],
    });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      session: {
        sessionToken: row.sessionToken as string,
        userId: row.userId as string,
        expires: new Date(row.expires as string)
      },
      user: {
        id: row.u_id as string,
        name: row.name as string | null,
        email: row.email as string,
        image: row.image as string | null,
        emailVerified: null
      },
    };
  },

  async updateSession(session: Partial<AdapterSession> & { sessionToken: string }): Promise<AdapterSession | null | undefined> {
    const res = await db.execute({
      sql: "SELECT userId, expires FROM sessions WHERE sessionToken = ?",
      args: [session.sessionToken] as LibSQLValue[],
    });
    if (res.rows.length === 0) return null;
    const current = res.rows[0];

    const expires = session.expires?.toISOString() ?? (current.expires as string);
    
    await db.execute({
      sql: "UPDATE sessions SET expires = ? WHERE sessionToken = ?",
      args: [expires, session.sessionToken] as LibSQLValue[],
    });
    
    return {
      sessionToken: session.sessionToken,
      userId: current.userId as string,
      expires: new Date(expires)
    };
  },

  async deleteSession(sessionToken: string): Promise<void> {
    await db.execute({ sql: "DELETE FROM sessions WHERE sessionToken = ?", args: [sessionToken] as LibSQLValue[] });
  },

  async createVerificationToken({ identifier, expires, token }: { identifier: string; expires: Date; token: string }): Promise<VerificationToken | null | undefined> {
    await db.execute({
      sql: "INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)",
      args: [identifier, token, expires.toISOString()] as LibSQLValue[],
    });
    return { identifier, expires, token };
  },

  async useVerificationToken({ identifier, token }: { identifier: string; token: string }): Promise<VerificationToken | null> {
    const res = await db.execute({
      sql: "SELECT * FROM verification_tokens WHERE identifier = ? AND token = ?",
      args: [identifier, token] as LibSQLValue[],
    });
    if (res.rows.length === 0) return null;
    
    await db.execute({
      sql: "DELETE FROM verification_tokens WHERE identifier = ? AND token = ?",
      args: [identifier, token] as LibSQLValue[],
    });
    
    const row = res.rows[0];
    return {
      identifier: row.identifier as string,
      token: row.token as string,
      expires: new Date(row.expires as string)
    };
  }
};

// --- 🚀 Auth Configuration ---
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: TursoAdapter,
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
    ...(process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_NODE_ENV === "development" ? [
      CredentialsProvider({
        id: "credentials",
        name: "Developer Bypass",
        credentials: {
          username: { label: "Username", type: "text" },
          password: { label: "Password", type: "password" }
        },
        async authorize(credentials) {
          if (credentials?.username === "dev" || credentials?.username === "guest") {
              return { 
                id: AUTH_CONFIG.DEV_USER_ID, 
                name: AUTH_CONFIG.DEV_USER_NAME, 
                email: AUTH_CONFIG.DEV_USER_EMAIL, 
                image: AUTH_CONFIG.DEV_AVATAR,
              };
          }
          return null;
        }
      })
    ] : []),
  ],
  session: { strategy: AUTH_CONFIG.SESSION_STRATEGY as "jwt" | "database" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.github_username = user.github_username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id;
        session.user.github_username = token.github_username;
      }
      return session;
    },
  },
  pages: {
    signIn: ROUTES.LOGIN,
  },
  debug: process.env.NODE_ENV === "development",
});
