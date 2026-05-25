import { HttpError } from '../middleware/errors.js';

const RANDOM_URL = 'https://www.themealdb.com/api/json/v1/1/random.php';
const TIMEOUT_MS = 5_000;

// Fetches a single random meal from TheMealDB. Returns the raw `meals[0]` payload —
// caller is responsible for normalization via OpenAI.
export async function fetchRandomMeal(): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(RANDOM_URL, { signal: controller.signal });
  } catch {
    throw new HttpError(502, 'TheMealDB unreachable');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new HttpError(502, `TheMealDB returned ${res.status}`);
  const body = (await res.json()) as { meals?: unknown[] | null };
  const meal = body.meals?.[0];
  if (!meal) throw new HttpError(502, 'TheMealDB returned no meal');
  return meal;
}
