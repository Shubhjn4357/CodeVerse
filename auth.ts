import NextAuth, { Session } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import type { Adapter } from "@auth/core/adapters";

// Define explicit strict types so we avoid using "any"
export interface TursoAdapterUser {
  id: string;
  email: string;
  emailVerified: Date | null;
  name?: string | null;
  image?: string | null;
  github_username?: string | null;
}

export interface TursoAdapterAccount {
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token?: string;
  access_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
  session_state?: string;
}

export interface TursoAdapterSession {
  sessionToken: string;
  userId: string;
  expires: Date;
}

export interface TursoVerificationToken {
  identifier: string;
  token: string;
  expires: Date;
}

// Basic custom Turso adapter implementation for NextAuth v5 with Strict Types
const TursoAdapter = {
  async createUser(user: Omit<TursoAdapterUser, "id">): Promise<TursoAdapterUser> {
    const id = randomUUID();
    await db.execute({
      sql: "INSERT INTO users (id, name, email, image, github_username) VALUES (?, ?, ?, ?, ?)",
      args: [id, user.name || null, user.email, user.image || null, user.github_username || null],
    });
    return { ...(user as TursoAdapterUser), id, emailVerified: null };
  },
  async getUser(id: string): Promise<TursoAdapterUser | null> {
    const res = await db.execute({
      sql: "SELECT * FROM users WHERE id = ?",
      args: [id],
    });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id as string,
      email: row.email as string,
      emailVerified: null,
      name: row.name as string | null,
      image: row.image as string | null,
      github_username: row.github_username as string | null
    };
  },
  async getUserByEmail(email: string): Promise<TursoAdapterUser | null> {
    const res = await db.execute({
      sql: "SELECT * FROM users WHERE email = ?",
      args: [email],
    });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id as string,
      email: row.email as string,
      emailVerified: null,
      name: row.name as string | null,
      image: row.image as string | null,
      github_username: row.github_username as string | null
    };
  },
  async getUserByAccount({ providerAccountId, provider }: Pick<TursoAdapterAccount, "provider" | "providerAccountId">): Promise<TursoAdapterUser | null> {
    const res = await db.execute({
      sql: `SELECT u.* FROM users u 
            JOIN accounts a ON u.id = a.userId 
            WHERE a.providerAccountId = ? AND a.provider = ?`,
      args: [providerAccountId, provider],
    });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id as string,
      email: row.email as string,
      emailVerified: null,
      name: row.name as string | null,
      image: row.image as string | null,
      github_username: row.github_username as string | null
    };
  },
  async updateUser(user: Partial<TursoAdapterUser> & Pick<TursoAdapterUser, "id">): Promise<TursoAdapterUser> {
    await db.execute({
      sql: "UPDATE users SET name = ?, email = ?, image = ?, github_username = ? WHERE id = ?",
      args: [user.name || null, user.email || null, user.image || null, user.github_username || null, user.id],
    });
    return user as TursoAdapterUser;
  },
  async deleteUser(userId: string): Promise<void> {
    await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [userId] });
  },
  async linkAccount(account: TursoAdapterAccount): Promise<TursoAdapterAccount> {
    await db.execute({
      sql: `INSERT INTO accounts (id, userId, provider, providerAccountId, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(), account.userId, account.provider, account.providerAccountId,
        account.refresh_token || null, account.access_token || null, account.expires_at || null,
        account.token_type || null, account.scope || null, account.id_token || null, account.session_state || null
      ],
    });
    return account;
  },
  async unlinkAccount({ providerAccountId, provider }: Pick<TursoAdapterAccount, "provider" | "providerAccountId">): Promise<void> {
    await db.execute({
      sql: "DELETE FROM accounts WHERE providerAccountId = ? AND provider = ?",
      args: [providerAccountId, provider],
    });
  },
  async createSession(session: TursoAdapterSession): Promise<TursoAdapterSession> {
    await db.execute({
      sql: "INSERT INTO sessions (id, sessionToken, userId, expires) VALUES (?, ?, ?, ?)",
      args: [randomUUID(), session.sessionToken, session.userId, session.expires.toISOString()],
    });
    return session;
  },
  async getSessionAndUser(sessionToken: string): Promise<{ session: TursoAdapterSession; user: TursoAdapterUser } | null> {
    const res = await db.execute({
      sql: `SELECT s.sessionToken, s.userId, s.expires, u.id as u_id, u.name, u.email, u.image 
            FROM sessions s JOIN users u ON s.userId = u.id 
            WHERE s.sessionToken = ?`,
      args: [sessionToken],
    });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    let expiresDate: Date;
    if (typeof row.expires === 'number') {
      expiresDate = new Date(row.expires);
    } else if (typeof row.expires === 'string') {
      expiresDate = new Date(row.expires);
    } else {
      expiresDate = new Date();
    }

    return {
      session: { sessionToken: row.sessionToken as string, userId: row.userId as string, expires: expiresDate },
      user: { id: row.u_id as string, name: row.name as string | null, email: row.email as string, image: row.image as string | null, emailVerified: null },
    };
  },
  async updateSession(session: Partial<TursoAdapterSession> & Pick<TursoAdapterSession, "sessionToken">): Promise<TursoAdapterSession | null | undefined> {
    if (!session.expires) return null;
    await db.execute({
      sql: "UPDATE sessions SET expires = ? WHERE sessionToken = ?",
      args: [session.expires.toISOString(), session.sessionToken],
    });
    return session as TursoAdapterSession;
  },
  async deleteSession(sessionToken: string): Promise<void> {
    await db.execute({ sql: "DELETE FROM sessions WHERE sessionToken = ?", args: [sessionToken] });
  },
  async createVerificationToken(token: TursoVerificationToken): Promise<TursoVerificationToken> {
    await db.execute({
      sql: "INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)",
      args: [token.identifier, token.token, token.expires.toISOString()],
    });
    return token;
  },
  async useVerificationToken({ identifier, token }: Pick<TursoVerificationToken, "identifier" | "token">): Promise<TursoVerificationToken | null> {
    const res = await db.execute({
      sql: "SELECT * FROM verification_tokens WHERE identifier = ? AND token = ?",
      args: [identifier, token],
    });
    if (res.rows.length === 0) return null;
    await db.execute({
      sql: "DELETE FROM verification_tokens WHERE identifier = ? AND token = ?",
      args: [identifier, token],
    });
    const row = res.rows[0];

    let expiresDate: Date;
    if (typeof row.expires === 'number') {
      expiresDate = new Date(row.expires);
    } else if (typeof row.expires === 'string') {
      expiresDate = new Date(row.expires);
    } else {
      expiresDate = new Date();
    }

    return { identifier: row.identifier as string, token: row.token as string, expires: expiresDate };
  }
};

const authOptions = {
  adapter: TursoAdapter as unknown as Adapter,
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
  ],
  session: { strategy: "database" as const },
  callbacks: {
    async session({ session, user }: { session: Session, user: TursoAdapterUser }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
