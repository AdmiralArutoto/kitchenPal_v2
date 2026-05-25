import OpenAI from 'openai';
import { openai } from './openai.js';
import { HttpError } from '../middleware/errors.js';

export interface ImageProvider {
  generate(prompt: string): Promise<{ bytes: Buffer; contentType: string }>;
}

// OpenAI gpt-image-1-mini @ medium quality. Returns base64 PNG directly
// (gpt-image-1 family does not support `response_format` — always b64).
// Quality scale is low|medium|high|auto.
const openaiImageProvider: ImageProvider = {
  async generate(prompt) {
    let b64: string | undefined;
    try {
      const response = await openai.images.generate(
        {
          model: 'gpt-image-1-mini',
          prompt,
          size: '1024x1024',
          quality: 'medium',
          n: 1,
        },
        { timeout: 60_000 },
      );
      b64 = response.data?.[0]?.b64_json;
    } catch (err: unknown) {
      if (err instanceof OpenAI.APIConnectionTimeoutError) {
        throw new HttpError(504, 'Image generation timed out');
      }
      if (err instanceof OpenAI.APIError) {
        throw new HttpError(502, `Image generation failed: ${err.message}`);
      }
      throw err;
    }

    if (!b64) throw new HttpError(500, 'Image generation returned no image data');
    return { bytes: Buffer.from(b64, 'base64'), contentType: 'image/png' };
  },
};

const fluxProvider: ImageProvider = {
  async generate() {
    throw new HttpError(501, 'Flux provider not yet implemented');
  },
};

const selected = (process.env.IMAGE_PROVIDER ?? 'openai').toLowerCase();
export const imageProvider: ImageProvider =
  selected === 'flux' ? fluxProvider : openaiImageProvider;
