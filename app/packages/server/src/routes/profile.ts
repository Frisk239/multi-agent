import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { UpdateUserProfileInput, type UserProfile } from '@ma/shared';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { LOCAL_MEMBER } from '../local-member.js';

function toProfile(row: typeof users.$inferSelect): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    about: row.about ?? '',
    updatedHint: '「关于你」会注入每次 agent 执行的 prompt（非密钥）',
  };
}

function ensureLocalUser(): typeof users.$inferSelect {
  const existing = db.select().from(users).where(eq(users.id, LOCAL_MEMBER.id)).get();
  if (existing) return existing;
  const now = Date.now();
  db.insert(users)
    .values({
      id: LOCAL_MEMBER.id,
      name: LOCAL_MEMBER.name,
      email: null,
      about: '',
      createdAt: now,
    })
    .run();
  return db.select().from(users).where(eq(users.id, LOCAL_MEMBER.id)).get()!;
}

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/profile', async (): Promise<UserProfile> => {
    return toProfile(ensureLocalUser());
  });

  app.put('/api/profile', async (req, reply) => {
    const parsed = UpdateUserProfileInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    if (input.name === undefined && input.about === undefined) {
      return reply.status(400).send({ error: '至少传 name 或 about' });
    }
    const prev = ensureLocalUser();
    const updates: Partial<typeof users.$inferInsert> = {};
    if (input.name !== undefined) updates.name = input.name.trim();
    if (input.about !== undefined) updates.about = input.about;
    if (Object.keys(updates).length === 0) {
      return toProfile(prev);
    }
    db.update(users).set(updates).where(eq(users.id, LOCAL_MEMBER.id)).run();
    const row = db.select().from(users).where(eq(users.id, LOCAL_MEMBER.id)).get()!;
    return toProfile(row);
  });
}
