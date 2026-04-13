function normalizeReviewBody(body) {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body && typeof body === 'object' ? body : null;
}

function validateContentCovered(contentCovered) {
  if (!Array.isArray(contentCovered) || contentCovered.length === 0) {
    return 'content_covered must be a non-empty array';
  }
  for (const item of contentCovered) {
    if (!item || typeof item !== 'object') {
      return 'each content_covered entry must be an object';
    }
    if (!Number.isInteger(item.day) || item.day <= 0) {
      return 'content_covered.day must be a positive integer';
    }
    if (typeof item.title !== 'string' || !item.title.trim()) {
      return 'content_covered.title must be a non-empty string';
    }
    if (typeof item.type !== 'string' || !item.type.trim()) {
      return 'content_covered.type must be a non-empty string';
    }
  }
  return null;
}

function validateKnowledgeChecks(knowledgeChecks) {
  if (!Array.isArray(knowledgeChecks) || knowledgeChecks.length === 0) {
    return 'knowledge_checks must be a non-empty array';
  }

  for (const check of knowledgeChecks) {
    if (!check || typeof check !== 'object') {
      return 'each knowledge_check must be an object';
    }
    if (typeof check.question !== 'string' || !check.question.trim()) {
      return 'each knowledge_check needs a question';
    }
    if (typeof check.topic !== 'string' || !check.topic.trim()) {
      return 'each knowledge_check needs a topic';
    }
    if (check.helper_text != null && typeof check.helper_text !== 'string') {
      return 'knowledge_check helper_text must be a string';
    }
    if (check.placeholder != null && typeof check.placeholder !== 'string') {
      return 'knowledge_check placeholder must be a string';
    }
    if (check.type != null && typeof check.type !== 'string') {
      return 'knowledge_check type must be a string';
    }
    if (check.expected_points != null) {
      if (!Array.isArray(check.expected_points) || check.expected_points.some((point) => typeof point !== 'string' || !point.trim())) {
        return 'knowledge_check expected_points must be an array of non-empty strings';
      }
    }
    if (check.options != null) {
      if (!Array.isArray(check.options) || check.options.length < 2 || check.options.some((opt) => typeof opt !== 'string' || !opt.trim())) {
        return 'knowledge_check options must be an array of at least 2 non-empty strings';
      }
    }
    if (check.type === 'multiple_choice') {
      if (!Array.isArray(check.options) || check.options.length < 2) {
        return 'multiple_choice knowledge_check must include options';
      }
      if (!Number.isInteger(check.correct_option) || check.correct_option < 0 || check.correct_option >= check.options.length) {
        return 'multiple_choice correct_option must be an integer index into options';
      }
    }
  }

  return null;
}

function validateReviewBody(body) {
  const normalized = normalizeReviewBody(body);
  if (!normalized) {
    return { error: 'body must be a valid JSON object' };
  }

  if (typeof normalized.summary !== 'string' || !normalized.summary.trim()) {
    return { error: 'summary must be a non-empty string' };
  }

  const contentError = validateContentCovered(normalized.content_covered);
  if (contentError) {
    return { error: contentError };
  }

  if (normalized.reflection_prompts != null) {
    if (!Array.isArray(normalized.reflection_prompts)
        || normalized.reflection_prompts.some((prompt) => typeof prompt !== 'string' || !prompt.trim())) {
      return { error: 'reflection_prompts, when present, must be an array of non-empty strings' };
    }
  }

  const knowledgeCheckError = validateKnowledgeChecks(normalized.knowledge_checks);
  if (knowledgeCheckError) {
    return { error: knowledgeCheckError };
  }

  return { value: normalized };
}

function assertValidReviewBody(body) {
  const result = validateReviewBody(body);
  if (result.error) {
    const err = new Error(`Invalid review body: ${result.error}`);
    err.code = 'INVALID_REVIEW_BODY';
    throw err;
  }
  return result.value;
}

module.exports = {
  normalizeReviewBody,
  validateReviewBody,
  validateKnowledgeChecks,
  validateContentCovered,
  assertValidReviewBody,
};
