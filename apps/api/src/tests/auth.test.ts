import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
    },
  },
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    profile: {
      upsert: vi.fn(),
    },
  },
}));

const { supabaseAdmin } = await import('../lib/supabase.js');
const { prisma } = await import('../lib/prisma.js');
const { createApp } = await import('../app.js');

const getUserMock = supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>;
const upsertMock = prisma.profile.upsert as ReturnType<typeof vi.fn>;

describe('authMiddleware on GET /api/me', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    upsertMock.mockReset();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(createApp()).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing or malformed Authorization header' });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is malformed', async () => {
    const res = await request(createApp())
      .get('/api/me')
      .set('Authorization', 'NotBearer abc');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing or malformed Authorization header' });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('returns 401 when supabaseAdmin.auth.getUser returns an error', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'bad token' },
    });

    const res = await request(createApp())
      .get('/api/me')
      .set('Authorization', 'Bearer some-token');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
    expect(getUserMock).toHaveBeenCalledWith('some-token');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns 200 with userId and upserts the profile when token is valid', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: userId } },
      error: null,
    });
    upsertMock.mockResolvedValueOnce({ id: userId, name: null, preferences: [] });

    const res = await request(createApp())
      .get('/api/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId });
    expect(getUserMock).toHaveBeenCalledWith('valid-token');
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith({
      where: { id: userId },
      create: { id: userId, preferences: [] },
      update: {},
    });
  });
});
