/**
 * Tests for the Gemini provider.
 *
 *   deno test supabase/functions/_shared/providers/google.test.ts
 *
 * These matter because this provider is the one the app runs on in production
 * and it is the one nobody can exercise locally without a key: the request
 * shape, the JSON-mime fallback and the daily-quota distinction are all things
 * that only ever fail in front of a warehouse employee.
 */
// Assertions are local on purpose: the Edge Function has no third-party deps,
// and a test that needs a network fetch to run is a test that stops running.
function assert(cond: unknown, msg = 'assertion failed'): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg ?? `expected ${e}, got ${a}`);
}
async function assertRejects(fn: () => Promise<unknown>, ctor: new (...a: never[]) => Error) {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof ctor)) throw new Error(`threw ${error}, expected ${ctor.name}`);
    return error;
  }
  throw new Error('expected the call to reject, but it resolved');
}

import { GoogleProvider } from './google.ts';
import { ProviderError } from './types.ts';

const INPUT = {
  imageBase64: 'AAAA',
  mimeType: 'image/jpeg',
  systemPrompt: 'SYSTEM',
  userInstruction: 'USER',
};

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init.body)),
      headers: init.headers as Record<string, string>,
    });
    return Promise.resolve(handler(String(url), init));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const ok = (obj: unknown) =>
  new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });

Deno.test('sends the image inline, the key as a header, and asks for JSON', async () => {
  const stub = stubFetch(() =>
    ok({ candidates: [{ content: { parts: [{ text: '{"documentType":"material_label"}' }] } }], modelVersion: 'gemini-x' }),
  );
  try {
    const result = await new GoogleProvider('SECRET').extract(INPUT);
    assertEquals(stub.calls.length, 1);
    const [call] = stub.calls;

    // The key must travel in a header — never in the URL, where it would end up
    // in proxy logs and browser history.
    assertEquals(call.headers['x-goog-api-key'], 'SECRET');
    assert(!call.url.includes('SECRET'), 'API key must not appear in the URL');
    assert(call.url.endsWith(':generateContent'));

    assertEquals(call.body.systemInstruction.parts[0].text, 'SYSTEM');
    assertEquals(call.body.contents[0].parts[0].inline_data.mime_type, 'image/jpeg');
    assertEquals(call.body.contents[0].parts[0].inline_data.data, 'AAAA');
    assertEquals(call.body.generationConfig.responseMimeType, 'application/json');
    assertEquals(call.body.generationConfig.temperature, 0);

    assertEquals((result.data as any).documentType, 'material_label');
    assertEquals(result.model, 'gemini-x');
  } finally {
    stub.restore();
  }
});

Deno.test('retries without responseMimeType when the model rejects it', async () => {
  let n = 0;
  const stub = stubFetch(() => {
    n += 1;
    if (n === 1) {
      return new Response('{"error":{"message":"Invalid JSON payload: responseMimeType"}}', { status: 400 });
    }
    return ok({ candidates: [{ content: { parts: [{ text: '```json\n{"documentType":"other"}\n```' }] } }] });
  });
  try {
    const result = await new GoogleProvider('K').extract(INPUT);
    assertEquals(stub.calls.length, 2);
    assertEquals(stub.calls[0].body.generationConfig.responseMimeType, 'application/json');
    assertEquals(stub.calls[1].body.generationConfig.responseMimeType, undefined);
    // The fenced answer of the fallback path must still parse.
    assertEquals((result.data as any).documentType, 'other');
  } finally {
    stub.restore();
  }
});

Deno.test('separates the daily allowance from a per-minute rate limit', async () => {
  const daily = stubFetch(() =>
    new Response('{"error":{"message":"Quota exceeded: GenerateRequestsPerDayPerProject"}}', { status: 429 }),
  );
  try {
    const error = await assertRejects(() => new GoogleProvider('K').extract(INPUT), ProviderError);
    assertEquals((error as ProviderError).code, 'DAILY_QUOTA_EXCEEDED');
  } finally {
    daily.restore();
  }

  const minute = stubFetch(() => new Response('{"error":{"message":"Too many requests"}}', { status: 429 }));
  try {
    const error = await assertRejects(() => new GoogleProvider('K').extract(INPUT), ProviderError);
    assertEquals((error as ProviderError).code, 'RATE_LIMITED');
  } finally {
    minute.restore();
  }
});

Deno.test('a rejected key reads as "not configured", even though Gemini says 400', async () => {
  // Gemini answers a bad key with 400 INVALID_ARGUMENT, not 401/403. Mistyping
  // the key is the likeliest setup mistake there is; it must not surface as a
  // vague provider outage.
  const stub = stubFetch(() =>
    new Response('{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}', { status: 400 }),
  );
  try {
    const error = await assertRejects(() => new GoogleProvider('bad').extract(INPUT), ProviderError);
    assertEquals((error as ProviderError).code, 'PROVIDER_NOT_CONFIGURED');
    // ...and it must not be mistaken for the responseMimeType fallback path.
    assertEquals(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

Deno.test('falls back to another free model when the default one is gone', async () => {
  const seen: string[] = [];
  const stub = stubFetch((url) => {
    seen.push(url);
    if (seen.length === 1) {
      return new Response('{"error":{"code":404,"message":"models/x is not found","status":"NOT_FOUND"}}', { status: 404 });
    }
    return ok({ candidates: [{ content: { parts: [{ text: '{"documentType":"material_label"}' }] } }] });
  });
  try {
    const result = await new GoogleProvider('K').extract(INPUT);
    assertEquals(seen.length, 2);
    assert(seen[0] !== seen[1], 'the retry must use a different model');
    assertEquals((result.data as any).documentType, 'material_label');
  } finally {
    stub.restore();
  }
});

Deno.test('asks the model not to spend time thinking, per model family', async () => {
  // Reading a printed label is transcription. Left at its default the model
  // spent ~16 s of a warehouse employee's time reasoning about it. The knob has
  // a different name on each generation and the wrong one is a 400.
  const three = stubFetch(() => ok({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }));
  try {
    await new GoogleProvider('K', 'gemini-3.5-flash').extract(INPUT);
    assertEquals(three.calls[0].body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  } finally {
    three.restore();
  }

  const twoFive = stubFetch(() => ok({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }));
  try {
    await new GoogleProvider('K', 'gemini-2.5-flash').extract(INPUT);
    assertEquals(twoFive.calls[0].body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
  } finally {
    twoFive.restore();
  }
});

Deno.test('drops the thinking setting rather than failing the scan over it', async () => {
  let n = 0;
  const stub = stubFetch(() => {
    n += 1;
    if (n === 1) {
      return new Response('{"error":{"code":400,"message":"Unknown name \\"thinkingConfig\\""}}', { status: 400 });
    }
    return ok({ candidates: [{ content: { parts: [{ text: '{"documentType":"material_label"}' }] } }] });
  });
  try {
    const result = await new GoogleProvider('K', 'gemini-3.5-flash').extract(INPUT);
    assertEquals(stub.calls.length, 2);
    assertEquals(stub.calls[1].body.generationConfig.thinkingConfig, undefined);
    // ...and the retry must not have thrown away the JSON request as well.
    assertEquals(stub.calls[1].body.generationConfig.responseMimeType, 'application/json');
    assertEquals((result.data as any).documentType, 'material_label');
  } finally {
    stub.restore();
  }
});

Deno.test('a bad key is never mistaken for a bad config field', async () => {
  // isKeyRejection is checked before the config ladder: otherwise a mistyped key
  // would burn three requests re-asking the same rejected question.
  const stub = stubFetch(() =>
    new Response('{"error":{"code":400,"message":"API key not valid. Please pass a valid API key."}}', { status: 400 }),
  );
  try {
    const error = await assertRejects(() => new GoogleProvider('bad').extract(INPUT), ProviderError);
    assertEquals((error as ProviderError).code, 'PROVIDER_NOT_CONFIGURED');
    assertEquals(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

Deno.test('an overloaded model is retried on the next free model', async () => {
  // Seen in production on day one: the free tier answered 503 UNAVAILABLE
  // ("This model is currently experiencing high demand"). That must not end the
  // scan while other free models are sitting there.
  let n = 0;
  const stub = stubFetch(() => {
    n += 1;
    if (n === 1) {
      return new Response(
        '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
        { status: 503 },
      );
    }
    return ok({ candidates: [{ content: { parts: [{ text: '{"documentType":"material_label"}' }] } }] });
  });
  try {
    const result = await new GoogleProvider('K').extract(INPUT);
    assertEquals(stub.calls.length, 2);
    assert(stub.calls[0].url !== stub.calls[1].url, 'the retry must use a different model');
    assertEquals((result.data as any).documentType, 'material_label');
  } finally {
    stub.restore();
  }
});

Deno.test('when every free model is busy the caller learns it is busy, not broken', async () => {
  // "Come back in a minute" and "someone has to configure this" are different
  // instructions; collapsing them sends the employee looking for an admin.
  const stub = stubFetch(() => new Response('{"error":{"code":503,"status":"UNAVAILABLE"}}', { status: 503 }));
  try {
    const error = await assertRejects(() => new GoogleProvider('K').extract(INPUT), ProviderError);
    assertEquals((error as ProviderError).code, 'PROVIDER_OVERLOADED');
    assert(stub.calls.length >= 2, 'every candidate model should have been tried');
  } finally {
    stub.restore();
  }
});

Deno.test('an explicitly pinned model is never silently swapped', async () => {
  // If an operator pinned AI_MODEL, quietly using a different model would mean
  // labels read by a model nobody chose. Fail instead.
  const stub = stubFetch(() =>
    new Response('{"error":{"code":404,"message":"is not found","status":"NOT_FOUND"}}', { status: 404 }),
  );
  try {
    const error = await assertRejects(
      () => new GoogleProvider('K', 'gemini-pinned-by-operator').extract(INPUT),
      ProviderError,
    );
    assertEquals((error as ProviderError).code, 'PROVIDER_NOT_CONFIGURED');
    assertEquals(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

Deno.test('an empty answer never becomes an empty label', async () => {
  const stub = stubFetch(() => ok({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }));
  try {
    const error = await assertRejects(() => new GoogleProvider('K').extract(INPUT), ProviderError);
    assertEquals((error as ProviderError).code, 'AI_INVALID_JSON');
  } finally {
    stub.restore();
  }
});
