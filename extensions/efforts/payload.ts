/**
 * Outgoing provider-payload rewriting.
 *
 * When the user picks a custom effort label (e.g. "max") that pi-ai does not
 * recognize, pi-ai's internal clamp downgrades the request to one of its
 * built-in levels before the HTTP body is built. We intercept the assembled
 * body via the `before_provider_request` hook and re-stamp the reasoning
 * fields with the actually-requested label so the API call honors the
 * user's choice.
 *
 * Recognized payload shapes:
 *
 *   - OpenAI Responses:        payload.reasoning.effort       (string)
 *   - OpenAI Chat Completions: payload.reasoning_effort       (string)
 *   - Anthropic adaptive:      payload.output_config.effort   (string)
 *   - Anthropic budget thinking: payload.thinking.budget_tokens (number)
 *
 * Numeric labels (e.g. "32768") are treated as a budget_tokens value when an
 * Anthropic budget-thinking payload is detected. Otherwise the literal string
 * is written into the effort field.
 */

export interface PayloadRewriteResult {
  /** The (possibly mutated) payload, ready to forward to the provider. */
  payload: unknown;
  /** Whether at least one effort/budget field was actually rewritten. */
  rewrote: boolean;
  /** Short human-readable description of what was changed (for debugging). */
  notes: string[];
}

const MAX_REASONABLE_BUDGET = 1_000_000;

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

function parseNumericEffort(effort: string): number | undefined {
  const trimmed = effort.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_REASONABLE_BUDGET) return undefined;
  return Math.floor(n);
}

/**
 * Rewrite an outgoing provider payload to match the user-picked effort label.
 * Returns the (mutated) payload and what we changed. Safe to call with any
 * value — non-object payloads are returned untouched.
 */
export function rewritePayload(payload: unknown, effort: string): PayloadRewriteResult {
  const result: PayloadRewriteResult = { payload, rewrote: false, notes: [] };
  const obj = asObject(payload);
  if (!obj) return result;

  // --- OpenAI Responses: payload.reasoning.effort -------------------------
  const reasoning = asObject(obj.reasoning);
  if (reasoning && "effort" in reasoning) {
    if (reasoning.effort !== effort) {
      reasoning.effort = effort;
      result.rewrote = true;
      result.notes.push(`reasoning.effort -> "${effort}"`);
    }
    // Encourage the API to stream reasoning summaries when present.
    if (!reasoning.summary) {
      reasoning.summary = "auto";
    }
    const include = obj.include;
    if (!Array.isArray(include)) {
      obj.include = ["reasoning.encrypted_content"];
    } else if (!include.includes("reasoning.encrypted_content")) {
      include.push("reasoning.encrypted_content");
    }
  }

  // --- OpenAI Chat Completions: reasoning_effort --------------------------
  if ("reasoning_effort" in obj) {
    if (obj.reasoning_effort !== effort) {
      obj.reasoning_effort = effort;
      result.rewrote = true;
      result.notes.push(`reasoning_effort -> "${effort}"`);
    }
  }

  // --- Anthropic adaptive thinking: output_config.effort ------------------
  const outputConfig = asObject(obj.output_config);
  if (outputConfig && "effort" in outputConfig) {
    if (outputConfig.effort !== effort) {
      outputConfig.effort = effort;
      result.rewrote = true;
      result.notes.push(`output_config.effort -> "${effort}"`);
    }
  }

  // --- Anthropic budget thinking: thinking.budget_tokens ------------------
  const thinking = asObject(obj.thinking);
  if (thinking) {
    if ("effort" in thinking) {
      // Adaptive-thinking shapes seen in some SDK versions stash effort here.
      if (thinking.effort !== effort) {
        thinking.effort = effort;
        result.rewrote = true;
        result.notes.push(`thinking.effort -> "${effort}"`);
      }
    } else if ("budget_tokens" in thinking) {
      const numeric = parseNumericEffort(effort);
      if (numeric !== undefined && thinking.budget_tokens !== numeric) {
        thinking.budget_tokens = numeric;
        // Be defensive about the discriminator.
        if (thinking.type !== "enabled") thinking.type = "enabled";
        result.rewrote = true;
        result.notes.push(`thinking.budget_tokens -> ${numeric}`);
      }
    }
  }

  result.payload = obj;
  return result;
}
