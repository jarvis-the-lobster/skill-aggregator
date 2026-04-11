const db = require('../models/database');
const reviewContentService = require('./reviewContentService');

const CHUNK_TARGET_SECONDS = 25 * 60;  // ~25 minutes per chunk
const CHUNK_MAX_SECONDS = 40 * 60;     // hard max 40 minutes per chunk
const CHUNK_THRESHOLD_SECONDS = 40 * 60; // only chunk videos > 40 min
const MAX_CHUNKS = 7;                   // max chunks per video
const EARLY_DAYS_MAX = 7;              // only chunk in days 1-7
const SHARED_PLAN_STALE_DAYS = 7;      // regenerate shared plans older than this

// Parse "M:SS" or "H:MM:SS" duration string to total seconds
function parseDuration(duration) {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// Format seconds as "M:SS" or "H:MM:SS"
function formatTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// Split a long YouTube video into consecutive-day chunks.
// Returns array of plan entries, or null if the video shouldn't be chunked.
function chunkVideo(video, startDay, reason) {
  if (video.source !== 'YouTube') return null;
  const totalSeconds = parseDuration(video.duration);
  if (totalSeconds <= CHUNK_THRESHOLD_SECONDS) return null;

  const numChunks = Math.min(
    Math.ceil(totalSeconds / CHUNK_TARGET_SECONDS),
    MAX_CHUNKS
  );
  // Don't chunk if it would exceed early days
  const availableDays = EARLY_DAYS_MAX - startDay + 1;
  const chunksToUse = Math.min(numChunks, availableDays);
  if (chunksToUse <= 1) return null;

  // Verify each chunk stays under hard max. If not, use the maximum chunk count we allow
  // and deliberately discard the remainder after the early-day chunk run.
  let chunkDuration = Math.ceil(totalSeconds / chunksToUse);
  if (chunkDuration > CHUNK_MAX_SECONDS) {
    if (availableDays <= 1) return null;
    const forcedChunks = Math.min(availableDays, MAX_CHUNKS);
    chunkDuration = CHUNK_TARGET_SECONDS;
    const cappedEntries = [];
    for (let i = 0; i < forcedChunks; i++) {
      const start = i * chunkDuration;
      const end = Math.min((i + 1) * chunkDuration, totalSeconds);
      cappedEntries.push({
        day_number: startDay + i,
        content_id: video.id,
        content_type: video.type,
        reason: i === 0 ? reason : `Continue: ${formatTimestamp(start)} – ${formatTimestamp(end)}`,
        timestamp_start_seconds: start,
        timestamp_end_seconds: end,
      });
    }
    return cappedEntries;
  }

  const entries = [];
  for (let i = 0; i < chunksToUse; i++) {
    const start = i * chunkDuration;
    const end = Math.min((i + 1) * chunkDuration, totalSeconds);
    entries.push({
      day_number: startDay + i,
      content_id: video.id,
      content_type: video.type,
      reason: i === 0 ? reason : `Continue: ${formatTimestamp(start)} – ${formatTimestamp(end)}`,
      timestamp_start_seconds: start,
      timestamp_end_seconds: end,
    });
  }
  return entries;
}

// Quality score: views + rating weighted higher
function qualityScore(row) {
  return (row.views || 0) + (row.rating || 0) * 1000;
}

function buildEntry(day, item, reason) {
  return {
    day_number: day,
    content_id: item?.id || null,
    content_type: item?.type || null,
    reason: item ? reason : null,
  };
}

class LearningPlanService {
  pickNext(candidates, usedIds) {
    const item = candidates.find(candidate => candidate && !usedIds.has(candidate.id)) || null;
    if (item) usedIds.add(item.id);
    return item;
  }

  isPlanIncomplete(plan) {
    if (plan.length !== 30) return true;

    const dayNumbers = new Set(plan.map(day => day.day_number));
    for (let day = 1; day <= 30; day++) {
      if (!dayNumbers.has(day)) return true;
    }

    return plan.some(day => !day.content_id);
  }

  // Generate and persist a 30-day plan for a skill based on existing content
  async generatePlan(skillId) {
    const allContent = await db.getSkillContent(skillId);

    const videos = allContent
      .filter(r => r.type === 'video')
      .sort((a, b) => qualityScore(b) - qualityScore(a));

    const articles = allContent
      .filter(r => r.type === 'article')
      .sort((a, b) => qualityScore(b) - qualityScore(a));

    const allRanked = [...videos, ...articles]
      .sort((a, b) => qualityScore(b) - qualityScore(a));

    const plan = [];
    const usedIds = new Set();

    // Days 1–7: prefer sane-length videos or properly chunkable videos, avoid giant unchunked videos
    for (let day = 1; day <= 7; day++) {
      const remainingEarlyDays = 8 - day;
      const candidateVideo = videos.find((video) => {
        if (usedIds.has(video.id)) return false;

        const chunks = chunkVideo(video, day, 'Top-ranked content to get you started');
        if (chunks && chunks.length <= remainingEarlyDays) return true;

        const durationSeconds = parseDuration(video.duration);
        return durationSeconds > 0 && durationSeconds <= CHUNK_MAX_SECONDS;
      });

      if (candidateVideo) {
        usedIds.add(candidateVideo.id);
        const chunks = chunkVideo(candidateVideo, day, 'Top-ranked content to get you started');
        if (chunks && chunks.length <= remainingEarlyDays) {
          for (const chunk of chunks) {
            plan.push(chunk);
          }
          day = chunks[chunks.length - 1].day_number;
        } else {
          plan.push(buildEntry(day, candidateVideo, 'Top-ranked content to get you started'));
        }
        continue;
      }

      const fallback = this.pickNext(allRanked, usedIds);
      plan.push(buildEntry(day, fallback, 'Top-ranked content to get you started'));
    }

    // Days 8–14: prefer articles, fallback to best remaining content
    for (let day = 8; day <= 14; day++) {
      const item = this.pickNext(articles, usedIds) || this.pickNext(allRanked, usedIds);
      plan.push(buildEntry(day, item, 'Key content to reinforce week 1 concepts'));
    }

    // Days 15–21: prefer remaining videos, fallback to best remaining content
    for (let day = 15; day <= 21; day++) {
      const item = this.pickNext(videos, usedIds) || this.pickNext(allRanked, usedIds);
      plan.push(buildEntry(day, item, 'Intermediate content to deepen understanding'));
    }

    // Days 22–28: prefer remaining articles, fallback to videos, then anything left
    for (let day = 22; day <= 28; day++) {
      const item = this.pickNext(articles, usedIds)
        || this.pickNext(videos, usedIds)
        || this.pickNext(allRanked, usedIds);
      plan.push(buildEntry(day, item, 'Advanced content to master the skill'));
    }

    // Days 29–30: best remaining content (capstone)
    for (let day = 29; day <= 30; day++) {
      const item = this.pickNext(allRanked, usedIds);
      plan.push(buildEntry(day, item, 'Capstone content to consolidate your learning'));
    }

    await db.saveLearningPlan(skillId, plan);

    const planCreatedAt = await db.getSharedPlanCreatedAt(skillId);
    await reviewContentService.enqueueReviewJobs(skillId, planCreatedAt);

    return db.getLearningPlan(skillId);
  }

  async isSharedPlanStale(skillId) {
    const createdAt = await db.getSharedPlanCreatedAt(skillId);
    if (!createdAt) return true;
    const planDate = new Date(createdAt.replace(' ', 'T') + 'Z');
    const ageMs = Date.now() - planDate.getTime();
    return ageMs > SHARED_PLAN_STALE_DAYS * 24 * 60 * 60 * 1000;
  }

  async getPlan(skillId) {
    const existing = await db.getLearningPlan(skillId);
    if (existing.length > 0) {
      if (this.isPlanIncomplete(existing) || await this.isSharedPlanStale(skillId)) {
        const allContent = await db.getSkillContent(skillId);
        if (allContent.length > 0) {
          return this.generatePlan(skillId);
        }
      }
      return existing;
    }
    const allContent = await db.getSkillContent(skillId);
    if (allContent.length === 0) return [];
    return this.generatePlan(skillId);
  }

  async getPlanWithReadiness(skillId) {
    const plan = await this.getPlan(skillId);
    const planReady = await reviewContentService.isPlanFullyReady(skillId);
    const reviewContent = await reviewContentService.getReviewContentMap(skillId);
    return { plan, planReady, reviewContent };
  }

  // Get or generate the shared plan, then copy it into user_learning_plans
  async copyPlanForUser(userId, skillId) {
    // Ensure shared plan exists
    const sharedPlan = await this.getPlan(skillId);

    // Copy into user_learning_plans (replaces any existing entries)
    await db.saveUserLearningPlan(userId, skillId, sharedPlan.map(day => ({
      day_number: day.day_number,
      content_id: day.content_id,
      content_type: day.content_type,
      reason: day.reason,
      timestamp_start_seconds: day.timestamp_start_seconds,
      timestamp_end_seconds: day.timestamp_end_seconds,
    })));

    return db.getUserLearningPlan(userId, skillId);
  }

  // Get user's personal plan, flagging if a refresh is available
  async getUserPlanWithRefresh(userId, skillId) {
    let userPlan = await db.getUserLearningPlan(userId, skillId);

    // Self-heal inconsistent states where enrollment/progress exists but the copied user plan rows are missing.
    if (userPlan.length === 0) {
      const progress = await db.getPlanProgress(userId, skillId);
      if (progress) {
        userPlan = await this.copyPlanForUser(userId, skillId);
      }
    }

    if (userPlan.length === 0) return { plan: [], refreshAvailable: false, planReady: true, reviewContent: {} };

    const planReady = await reviewContentService.isPlanFullyReady(skillId);

    // Only flag refresh when the shared plan is fully ready (review content generated)
    // and the shared plan is newer than the user's copy. This prevents the double-update
    // problem where a user sees "Update Plan" before review content is finished.
    let refreshAvailable = false;
    if (planReady) {
      const sharedCreatedAt = await db.getSharedPlanCreatedAt(skillId);
      const userMaxCreatedAt = await db.getUserPlanMaxCreatedAt(userId, skillId);
      if (sharedCreatedAt && userMaxCreatedAt) {
        const sharedDate = new Date(sharedCreatedAt.replace(' ', 'T') + 'Z');
        const userDate = new Date(userMaxCreatedAt.replace(' ', 'T') + 'Z');
        refreshAvailable = sharedDate > userDate;
      }
    }

    const reviewContent = await reviewContentService.getReviewContentMap(skillId);

    return { plan: userPlan, refreshAvailable, planReady, reviewContent };
  }

  // Actually apply the refresh — called when user opts in.
  // Merge semantics:
  //   1. Completed days are immutable
  //   2. Existing chunked day runs (timestamped entries) are immutable
  //   3. Remaining days realign toward the current shared plan
  //   4. No duplicate content_ids after merge
  //   5. All 30 days filled; days 1-7 always have content
  async refreshUserPlan(userId, skillId) {
    const progress = await db.getPlanProgress(userId, skillId);
    const completedDays = new Set(JSON.parse(progress?.completed_days || '[]'));
    const userPlan = await db.getUserLearningPlan(userId, skillId);
    const sharedPlan = await db.getLearningPlan(skillId);

    // --- Step 1: identify immutable days and used content_ids ---
    const immutableDays = new Set();
    const usedContentIds = new Set();

    // Completed days are immutable
    for (const day of userPlan) {
      if (completedDays.has(day.day_number)) {
        immutableDays.add(day.day_number);
        if (day.content_id) usedContentIds.add(day.content_id);
      }
    }

    // Existing chunked runs (timestamped entries) are immutable
    for (const day of userPlan) {
      if (day.timestamp_start_seconds != null && day.content_id) {
        immutableDays.add(day.day_number);
        usedContentIds.add(day.content_id);
      }
    }

    // --- Step 2: identify shared plan chunk runs ---
    const sharedChunkRuns = new Map(); // content_id -> [entries]
    for (const day of sharedPlan) {
      if (day.timestamp_start_seconds != null && day.content_id) {
        if (!sharedChunkRuns.has(day.content_id)) sharedChunkRuns.set(day.content_id, []);
        sharedChunkRuns.get(day.content_id).push(day);
      }
    }

    // --- Step 3: build merged plan ---
    const merged = new Array(30).fill(null);

    // Place immutable days (these won't be written — they stay in DB untouched)
    for (const day of userPlan) {
      if (immutableDays.has(day.day_number)) {
        merged[day.day_number - 1] = day;
      }
    }

    // Try to place shared plan chunk runs atomically on mutable days
    for (const [contentId, entries] of sharedChunkRuns) {
      if (usedContentIds.has(contentId)) continue;
      const allAvailable = entries.every(e => !merged[e.day_number - 1]);
      if (allAvailable) {
        for (const entry of entries) {
          merged[entry.day_number - 1] = {
            day_number: entry.day_number,
            content_id: entry.content_id,
            content_type: entry.content_type,
            reason: entry.reason,
            timestamp_start_seconds: entry.timestamp_start_seconds,
            timestamp_end_seconds: entry.timestamp_end_seconds,
          };
        }
        usedContentIds.add(contentId);
      }
    }

    // Fill mutable days from shared plan (non-chunk, single-day entries)
    for (const day of sharedPlan) {
      const idx = day.day_number - 1;
      if (merged[idx]) continue;
      if (!day.content_id || usedContentIds.has(day.content_id)) continue;
      if (sharedChunkRuns.has(day.content_id)) continue; // already handled above

      merged[idx] = {
        day_number: day.day_number,
        content_id: day.content_id,
        content_type: day.content_type,
        reason: day.reason,
        timestamp_start_seconds: day.timestamp_start_seconds,
        timestamp_end_seconds: day.timestamp_end_seconds,
      };
      usedContentIds.add(day.content_id);
    }

    // Collect unused shared plan content for gap-filling
    const unusedShared = [];
    const seenIds = new Set();
    for (const d of sharedPlan) {
      if (d.content_id && !usedContentIds.has(d.content_id)
          && !sharedChunkRuns.has(d.content_id) && !seenIds.has(d.content_id)) {
        unusedShared.push(d);
        seenIds.add(d.content_id);
      }
    }
    let unusedIdx = 0;

    // Fill remaining empty days
    for (let i = 0; i < 30; i++) {
      if (merged[i]) continue;

      if (unusedIdx < unusedShared.length) {
        const src = unusedShared[unusedIdx++];
        merged[i] = {
          day_number: i + 1,
          content_id: src.content_id,
          content_type: src.content_type,
          reason: src.reason,
          timestamp_start_seconds: src.timestamp_start_seconds,
          timestamp_end_seconds: src.timestamp_end_seconds,
        };
        usedContentIds.add(src.content_id);
      } else {
        // Fall back to existing user plan content if not a duplicate
        const userDay = userPlan.find(d => d.day_number === i + 1);
        if (userDay?.content_id && !usedContentIds.has(userDay.content_id)) {
          merged[i] = {
            day_number: i + 1,
            content_id: userDay.content_id,
            content_type: userDay.content_type,
            reason: userDay.reason,
            timestamp_start_seconds: userDay.timestamp_start_seconds,
            timestamp_end_seconds: userDay.timestamp_end_seconds,
          };
          usedContentIds.add(userDay.content_id);
        } else {
          merged[i] = { day_number: i + 1, content_id: null, content_type: null, reason: null };
        }
      }
    }

    // Write only mutable days — immutable days keep their original created_at
    const mutableEntries = merged.filter((_, i) => !immutableDays.has(i + 1));
    if (mutableEntries.length > 0) {
      await db.refreshUserPlanDays(userId, skillId, mutableEntries);
    }

    return db.getUserLearningPlan(userId, skillId);
  }
}

const service = new LearningPlanService();
service._parseDuration = parseDuration;
service._formatTimestamp = formatTimestamp;
service._chunkVideo = chunkVideo;
service.SHARED_PLAN_STALE_DAYS = SHARED_PLAN_STALE_DAYS;
module.exports = service;
