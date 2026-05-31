import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import {
  GenerateDraftsRequestSchema,
  GenerateFullRequestSchema,
  ModifyRequestSchema,
  DraftsResponseSchema,
  FullRecipeResponseSchema,
} from '../schemas/ai.js';
import {
  callOpenAIJson,
  appendPreferences,
  MODEL_DRAFTS,
  MODEL_FULL,
  DRAFTS_SYSTEM_PROMPT,
  FULL_SYSTEM_PROMPT,
  MODIFY_SYSTEM_PROMPT,
} from '../lib/openai.js';
import { buildModifyDiff } from '../lib/diff.js';

export const aiRouter = Router();
aiRouter.use(authMiddleware);

async function getPreferences(userId: string): Promise<string[]> {
  const p = await prisma.profile.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  return p?.preferences ?? [];
}

aiRouter.post('/generate-drafts', async (req, res) => {
  const parsed = GenerateDraftsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  }
  const prefs = await getPreferences(req.userId!);
  const userPrompt = appendPreferences(parsed.data.prompt, prefs);

  const result = await callOpenAIJson({
    model: MODEL_DRAFTS,
    systemPrompt: DRAFTS_SYSTEM_PROMPT,
    userPrompt,
    schema: DraftsResponseSchema,
  });
  res.json(result.drafts);
});

aiRouter.post('/generate-full', async (req, res) => {
  const parsed = GenerateFullRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  }
  const prefs = await getPreferences(req.userId!);
  const { input, comment } = parsed.data;
  const base = `Input recipe or draft (JSON): ${JSON.stringify(input)}`;
  const withComment = comment ? `${base}\nRefinement comment: ${comment}` : base;
  const userPrompt = appendPreferences(withComment, prefs);

  const result = await callOpenAIJson({
    model: MODEL_FULL,
    systemPrompt: FULL_SYSTEM_PROMPT,
    userPrompt,
    schema: FullRecipeResponseSchema,
  });
  res.json(result);
});

aiRouter.post('/modify', async (req, res) => {
  const parsed = ModifyRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  }
  const { recipe, comment } = parsed.data;
  // NOTE: no preference injection by design — SPEC §6, CLAUDE.md decisions log.
  const userPrompt = `Recipe (JSON): ${JSON.stringify(recipe)}\nModification: ${comment}`;

  const result = await callOpenAIJson({
    model: MODEL_FULL,
    systemPrompt: MODIFY_SYSTEM_PROMPT,
    userPrompt,
    schema: FullRecipeResponseSchema,
  });
  // Compute a deterministic diff (original request recipe vs the AI result) for the Modify studio.
  const diff = buildModifyDiff(recipe, result);
  res.json({ recipe: result, diff });
});
