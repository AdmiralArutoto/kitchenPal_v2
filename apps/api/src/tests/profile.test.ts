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
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../lib/storage.js', () => ({
  buildAvatarKey: vi.fn(() => 'avatars/key.png'),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  keyFromUrl: vi.fn(),
}));

const { supabaseAdmin } = await import('../lib/supabase.js');
const { prisma } = await import('../lib/prisma.js');
const storage = await import('../lib/storage.js');
const { createApp } = await import('../app.js');

const getUserMock = supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>;
const upsertMock = prisma.profile.upsert as ReturnType<typeof vi.fn>;
const findUniqueMock = prisma.profile.findUnique as ReturnType<typeof vi.fn>;
const updateMock = prisma.profile.update as ReturnType<typeof vi.fn>;
const uploadImageMock = storage.uploadImage as ReturnType<typeof vi.fn>;
const deleteImageMock = storage.deleteImage as ReturnType<typeof vi.fn>;
const keyFromUrlMock = storage.keyFromUrl as ReturnType<typeof vi.fn>;

const userId = '22222222-2222-2222-2222-222222222222';
const email = 'arthur@example.com';

type Method = 'get' | 'post' | 'put' | 'delete';

function authed(method: Method, path: string) {
  getUserMock.mockResolvedValueOnce({ data: { user: { id: userId, email } }, error: null });
  upsertMock.mockResolvedValueOnce({ id: userId });
  return request(createApp())[method](path).set('Authorization', 'Bearer t');
}

describe('GET /api/profile', () => {
  beforeEach(() => vi.resetAllMocks());

  it('401 without auth', async () => {
    const res = await request(createApp()).get('/api/profile');
    expect(res.status).toBe(401);
  });

  it('returns profile with email from JWT', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: userId,
      name: 'Arthur',
      preferences: ['vegan', 'gluten-free'],
    });

    const res = await authed('get', '/api/profile');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Arthur', preferences: ['vegan', 'gluten-free'], email });
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { id: userId } });
  });
});

describe('PUT /api/profile', () => {
  beforeEach(() => vi.resetAllMocks());

  it('401 without auth', async () => {
    const res = await request(createApp()).put('/api/profile').send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('updates name and preferences', async () => {
    updateMock.mockResolvedValueOnce({
      id: userId,
      name: 'Arthur T.',
      preferences: ['vegan'],
    });

    const res = await authed('put', '/api/profile').send({
      name: 'Arthur T.',
      preferences: ['vegan'],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Arthur T.', preferences: ['vegan'], email });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: userId },
      data: { name: 'Arthur T.', preferences: ['vegan'] },
    });
  });

  it('400 on invalid body shape', async () => {
    const res = await authed('put', '/api/profile').send({ preferences: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/profile/avatar', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    uploadImageMock.mockResolvedValue('https://cdn.example/avatars/key.png');
    keyFromUrlMock.mockImplementation((u: string) => (u.includes('/public/') ? 'old-key' : null));
    deleteImageMock.mockResolvedValue(undefined);
  });

  it('401 without auth', async () => {
    const res = await request(createApp())
      .post('/api/profile/avatar')
      .attach('file', Buffer.from('img'), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('uploads an avatar and returns its URL', async () => {
    const res = await authed('post', '/api/profile/avatar').attach('file', Buffer.from('img'), {
      filename: 'a.png',
      contentType: 'image/png',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ avatarUrl: 'https://cdn.example/avatars/key.png' });
    expect(uploadImageMock).toHaveBeenCalledOnce();
    expect(deleteImageMock).not.toHaveBeenCalled();
  });

  it('deletes the previous avatar when one is provided', async () => {
    const res = await authed('post', '/api/profile/avatar')
      .field('previous', 'https://cdn.example/storage/v1/object/public/recipe-images/old.png')
      .attach('file', Buffer.from('img'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(deleteImageMock).toHaveBeenCalledWith('old-key');
  });

  it('400 when no file is attached', async () => {
    const res = await authed('post', '/api/profile/avatar').send();
    expect(res.status).toBe(400);
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  it('400 for a non-image file', async () => {
    const res = await authed('post', '/api/profile/avatar').attach('file', Buffer.from('x'), {
      filename: 'a.txt',
      contentType: 'text/plain',
    });
    expect(res.status).toBe(400);
    expect(uploadImageMock).not.toHaveBeenCalled();
  });
});
