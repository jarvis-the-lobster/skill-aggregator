const db = require('../models/database');

// Status precedence for user_courses: higher = wins
const STATUS_RANK = { active: 2, completed: 1 };

/**
 * Safe skill merge service.
 *
 * Supports two flows:
 * 1. Rename: source exists, target does NOT exist → create target skill from source metadata, migrate everything.
 * 2. Merge:  source exists, target exists → merge rows with conflict resolution, delete source.
 *
 * Both flows support dry-run (read-only impact report) and execute (mutate + summary).
 *
 * Premium vs shared/free user_learning_plans merge strategy:
 * - Shared/free users: smart content-family merge (existing behavior)
 * - Premium users: winner-pick — keep the plan with more completed days, tie-break target
 */
class SkillMergeService {

  // ── public entry point ──────────────────────────────────────────────

  async safeMerge(sourceId, targetId, { dryRun = true } = {}) {
    if (!sourceId || !targetId) throw new Error('sourceId and targetId required');
    if (sourceId === targetId) throw new Error('sourceId and targetId must differ');

    const source = await db.query('SELECT * FROM skills WHERE id = ?', [sourceId]);
    if (source.length === 0) throw Object.assign(new Error(`Source skill '${sourceId}' not found`), { status: 404 });

    const target = await db.query('SELECT * FROM skills WHERE id = ?', [targetId]);
    const isRename = target.length === 0;

    // Collect impact report (always — even for execute mode we return it)
    const report = await this._buildReport(sourceId, targetId, isRename);

    if (dryRun) {
      return { dryRun: true, mode: isRename ? 'rename' : 'merge', sourceId, targetId, ...report };
    }

    // Execute atomically — any mid-flight failure rolls back every write.
    await this._runInTransaction(async () => {
      if (isRename) {
        await this._executeRename(sourceId, targetId, source[0]);
      } else {
        await this._executeMerge(sourceId, targetId);
      }

      // Verify source is gone (inside the txn so a failed verification rolls back too)
      const check = await db.query('SELECT id FROM skills WHERE id = ?', [sourceId]);
      if (check.length > 0) throw new Error('Post-merge verification failed: source skill still exists');
    });

    return { dryRun: false, mode: isRename ? 'rename' : 'merge', sourceId, targetId, ...report };
  }

  async _runInTransaction(fn) {
    await db.insert('BEGIN IMMEDIATE TRANSACTION');
    try {
      const result = await fn();
      await db.insert('COMMIT');
      return result;
    } catch (err) {
      try {
        await db.insert('ROLLBACK');
      } catch (rollbackErr) {
        console.error('safeMerge rollback error:', rollbackErr.message);
      }
      throw err;
    }
  }

  // ── impact report (read-only) ───────────────────────────────────────

  async _buildReport(sourceId, targetId, isRename) {
    const [
      sourceContent, targetContent,
      sourceUserCourses, targetUserCourses,
      sourceProgress, targetProgress,
      sourceUserPlans, targetUserPlans,
      sourceLearningPlans, targetLearningPlans,
      sourceScrapeLogs,
      sourcePlanJobs, targetPlanJobs,
      sourceReviewContent, targetReviewContent,
      sourceReviewSubs, targetReviewSubs,
      sourcePremiumDays, targetPremiumDays,
    ] = await Promise.all([
      db.query('SELECT id FROM content WHERE skill_id = ?', [sourceId]),
      isRename ? [] : db.query('SELECT id FROM content WHERE skill_id = ?', [targetId]),
      db.query('SELECT * FROM user_courses WHERE skill_id = ?', [sourceId]),
      isRename ? [] : db.query('SELECT * FROM user_courses WHERE skill_id = ?', [targetId]),
      db.query('SELECT * FROM user_plan_progress WHERE skill_id = ?', [sourceId]),
      isRename ? [] : db.query('SELECT * FROM user_plan_progress WHERE skill_id = ?', [targetId]),
      db.query('SELECT * FROM user_learning_plans WHERE skill_id = ?', [sourceId]),
      isRename ? [] : db.query('SELECT * FROM user_learning_plans WHERE skill_id = ?', [targetId]),
      db.query('SELECT * FROM learning_plans WHERE skill_id = ?', [sourceId]),
      isRename ? [] : db.query('SELECT * FROM learning_plans WHERE skill_id = ?', [targetId]),
      db.query('SELECT id FROM scrape_log WHERE skill_id = ?', [sourceId]),
      db.query('SELECT id FROM plan_jobs WHERE skill_id = ?', [sourceId]),
      isRename ? [] : db.query('SELECT id FROM plan_jobs WHERE skill_id = ?', [targetId]),
      db.query('SELECT id FROM plan_review_content WHERE skill_id = ?', [sourceId]),
      isRename ? [] : db.query('SELECT id FROM plan_review_content WHERE skill_id = ?', [targetId]),
      db.query('SELECT * FROM review_submissions WHERE skill_id = ?', [sourceId]),
      isRename ? [] : db.query('SELECT * FROM review_submissions WHERE skill_id = ?', [targetId]),
      db.query('SELECT * FROM premium_plan_days WHERE skill_id = ?', [sourceId]),
      isRename ? [] : db.query('SELECT * FROM premium_plan_days WHERE skill_id = ?', [targetId]),
    ]);

    // Content duplicates (same id in both source and target)
    const targetContentIds = new Set(targetContent.map(r => r.id));
    const contentDuplicates = sourceContent.filter(r => targetContentIds.has(r.id)).map(r => r.id);

    // User courses conflicts (same user_id in both)
    const targetCoursesByUser = new Map(targetUserCourses.map(r => [r.user_id, r]));
    const userCourseConflicts = sourceUserCourses
      .filter(r => targetCoursesByUser.has(r.user_id))
      .map(r => ({
        user_id: r.user_id,
        source_status: r.status,
        target_status: targetCoursesByUser.get(r.user_id).status,
        resolved_status: this._resolveStatus(r.status, targetCoursesByUser.get(r.user_id).status),
      }));

    // User plan progress conflicts (same user_id in both)
    const targetProgressByUser = new Map(targetProgress.map(r => [r.user_id, r]));
    const progressConflicts = sourceProgress
      .filter(r => targetProgressByUser.has(r.user_id))
      .map(r => {
        const t = targetProgressByUser.get(r.user_id);
        const srcDays = JSON.parse(r.completed_days || '[]');
        const tgtDays = JSON.parse(t.completed_days || '[]');
        const merged = [...new Set([...srcDays, ...tgtDays])].sort((a, b) => a - b);
        return {
          user_id: r.user_id,
          source_days: srcDays,
          target_days: tgtDays,
          merged_days: merged,
          days_added: merged.length - tgtDays.length,
        };
      });

    // User learning plans: count affected users
    const sourceUlpUsers = [...new Set(sourceUserPlans.map(r => r.user_id))];
    const targetUlpUsers = new Set(targetUserPlans.map(r => r.user_id));
    const ulpConflictUsers = sourceUlpUsers.filter(u => targetUlpUsers.has(u));
    const ulpMoveUsers = sourceUlpUsers.filter(u => !targetUlpUsers.has(u));

    // Plan jobs conflicts (same user_id + day_number + job_type + status in both)
    const targetJobsByKey = new Set(targetPlanJobs.map(r => this._planJobConflictKey(r)));
    const planJobConflicts = sourcePlanJobs.filter(r => targetJobsByKey.has(this._planJobConflictKey(r)));

    // Plan review content conflicts (same user_id + day_number + review_type in both)
    const targetReviewContentByKey = new Set(targetReviewContent.map(r => this._planReviewContentConflictKey(r)));
    const reviewContentConflicts = sourceReviewContent.filter(r => targetReviewContentByKey.has(this._planReviewContentConflictKey(r)));

    // Review submissions conflicts (same user_id + day_number in both)
    const targetSubsByKey = new Set(targetReviewSubs.map(r => `${r.user_id}:${r.day_number}`));
    const reviewSubConflicts = sourceReviewSubs.filter(r => targetSubsByKey.has(`${r.user_id}:${r.day_number}`));

    // Premium plan days conflicts (same user_id + day_number in both)
    const targetPremiumByKey = new Set(targetPremiumDays.map(r => `${r.user_id}:${r.day_number}`));
    const premiumDayConflicts = sourcePremiumDays.filter(r => targetPremiumByKey.has(`${r.user_id}:${r.day_number}`));

    return {
      impact: {
        content: {
          source_count: sourceContent.length,
          target_count: targetContent.length,
          duplicates: contentDuplicates.length,
          will_move: sourceContent.length - contentDuplicates.length,
          duplicate_ids: contentDuplicates.slice(0, 20),
        },
        user_courses: {
          source_count: sourceUserCourses.length,
          conflicts: userCourseConflicts.length,
          will_move: sourceUserCourses.length - userCourseConflicts.length,
          conflict_details: userCourseConflicts,
        },
        user_plan_progress: {
          source_count: sourceProgress.length,
          conflicts: progressConflicts.length,
          will_move: sourceProgress.length - progressConflicts.length,
          conflict_details: progressConflicts,
        },
        user_learning_plans: {
          source_count: sourceUserPlans.length,
          source_users: sourceUlpUsers.length,
          conflict_users: ulpConflictUsers.length,
          move_users: ulpMoveUsers.length,
        },
        learning_plans: {
          source_count: sourceLearningPlans.length,
          target_count: targetLearningPlans.length,
          action: isRename ? 'move' : (targetLearningPlans.length > 0 ? 'keep_target' : 'move_source'),
        },
        scrape_log: {
          source_count: sourceScrapeLogs.length,
        },
        plan_jobs: {
          source_count: sourcePlanJobs.length,
          target_count: targetPlanJobs.length,
          conflicts: planJobConflicts.length,
          will_move: sourcePlanJobs.length - planJobConflicts.length,
        },
        plan_review_content: {
          source_count: sourceReviewContent.length,
          target_count: targetReviewContent.length,
          conflicts: reviewContentConflicts.length,
          will_move: sourceReviewContent.length - reviewContentConflicts.length,
        },
        review_submissions: {
          source_count: sourceReviewSubs.length,
          conflicts: reviewSubConflicts.length,
          will_move: sourceReviewSubs.length - reviewSubConflicts.length,
        },
        premium_plan_days: {
          source_count: sourcePremiumDays.length,
          conflicts: premiumDayConflicts.length,
          will_move: sourcePremiumDays.length - premiumDayConflicts.length,
        },
      },
    };
  }

  // ── rename (target does not exist) ──────────────────────────────────

  async _executeRename(sourceId, targetId, sourceSkill) {
    // Create the target skill from source metadata
    await db.insert(
      `INSERT INTO skills (id, name, category, difficulty, description, estimated_hours, status, last_scraped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [targetId, sourceSkill.name, sourceSkill.category, sourceSkill.difficulty,
       sourceSkill.description, sourceSkill.estimated_hours, sourceSkill.status, sourceSkill.last_scraped_at]
    );

    // Move all related data — no conflicts possible since target is new
    await db.insert('UPDATE content SET skill_id = ? WHERE skill_id = ?', [targetId, sourceId]);
    await db.insert('UPDATE learning_plans SET skill_id = ? WHERE skill_id = ?', [targetId, sourceId]);
    await db.insert('UPDATE user_courses SET skill_id = ? WHERE skill_id = ?', [targetId, sourceId]);
    await db.insert('UPDATE user_plan_progress SET skill_id = ? WHERE skill_id = ?', [targetId, sourceId]);
    await db.insert('UPDATE user_learning_plans SET skill_id = ? WHERE skill_id = ?', [targetId, sourceId]);
    await db.insert('UPDATE plan_jobs SET skill_id = ? WHERE skill_id = ?', [targetId, sourceId]);
    await db.insert('UPDATE plan_review_content SET skill_id = ? WHERE skill_id = ?', [targetId, sourceId]);
    await db.insert('UPDATE review_submissions SET skill_id = ? WHERE skill_id = ?', [targetId, sourceId]);
    await db.insert('UPDATE premium_plan_days SET skill_id = ? WHERE skill_id = ?', [targetId, sourceId]);
    await db.saveSkillAlias(sourceId, targetId);
    await db.insert('DELETE FROM skills WHERE id = ?', [sourceId]);
  }

  // ── merge (target exists) ──────────────────────────────────────────

  async _executeMerge(sourceId, targetId) {
    // 1. Content: move non-duplicates, delete source duplicates
    await db.insert(
      `UPDATE content SET skill_id = ? WHERE skill_id = ? AND id NOT IN (SELECT id FROM content WHERE skill_id = ?)`,
      [targetId, sourceId, targetId]
    );
    await db.insert('DELETE FROM content WHERE skill_id = ?', [sourceId]);

    // 2. User courses: merge with conflict resolution
    await this._mergeUserCourses(sourceId, targetId);

    // Capture pre-merge progress before union (needed for premium winner-pick and immutability)
    const preMergeSourceProgress = await db.query('SELECT * FROM user_plan_progress WHERE skill_id = ?', [sourceId]);
    const preMergeTargetProgress = await db.query('SELECT * FROM user_plan_progress WHERE skill_id = ?', [targetId]);

    // 3. User plan progress: merge completed_days
    await this._mergeUserPlanProgress(sourceId, targetId);

    // 4. User learning plans: merge carefully (using pre-merge progress)
    await this._mergeUserLearningPlans(sourceId, targetId, preMergeSourceProgress, preMergeTargetProgress);

    // 5. Learning plans: keep target if it has rows, otherwise move source
    const targetPlanCount = await db.query('SELECT COUNT(*) as cnt FROM learning_plans WHERE skill_id = ?', [targetId]);
    if (targetPlanCount[0].cnt === 0) {
      await db.insert('UPDATE learning_plans SET skill_id = ? WHERE skill_id = ?', [targetId, sourceId]);
    } else {
      await db.insert('DELETE FROM learning_plans WHERE skill_id = ?', [sourceId]);
    }

    // 6. Scrape log: leave on source for historical accuracy

    // 7. Plan jobs: merge with conflict resolution (target wins on conflict)
    await this._mergePlanJobs(sourceId, targetId);

    // 8. Plan review content: merge with conflict resolution (target wins on conflict)
    await this._mergePlanReviewContent(sourceId, targetId);

    // 9. Review submissions: merge with conflict resolution (target wins on conflict)
    await this._mergeReviewSubmissions(sourceId, targetId);

    // 10. Premium plan days: merge with conflict resolution (target wins on conflict)
    await this._mergePremiumPlanDays(sourceId, targetId);

    // 11. Delete source skill
    await db.saveSkillAlias(sourceId, targetId);
    await db.insert('DELETE FROM skills WHERE id = ?', [sourceId]);
  }

  // ── user_courses conflict resolution ────────────────────────────────

  async _mergeUserCourses(sourceId, targetId) {
    const sourceRows = await db.query('SELECT * FROM user_courses WHERE skill_id = ?', [sourceId]);
    const targetRows = await db.query('SELECT * FROM user_courses WHERE skill_id = ?', [targetId]);
    const targetByUser = new Map(targetRows.map(r => [r.user_id, r]));

    for (const src of sourceRows) {
      const tgt = targetByUser.get(src.user_id);
      if (!tgt) {
        // No conflict — move
        await db.insert('UPDATE user_courses SET skill_id = ? WHERE id = ?', [targetId, src.id]);
      } else {
        // Conflict — merge into target row
        const resolvedStatus = this._resolveStatus(src.status, tgt.status);
        const earliestEnrolled = this._earliest(src.enrolled_at, tgt.enrolled_at);
        const latestActivity = this._latest(src.last_activity_at, tgt.last_activity_at);

        await db.insert(
          `UPDATE user_courses SET status = ?, enrolled_at = ?, last_activity_at = ? WHERE id = ?`,
          [resolvedStatus, earliestEnrolled, latestActivity, tgt.id]
        );
        // Delete source duplicate
        await db.insert('DELETE FROM user_courses WHERE id = ?', [src.id]);
      }
    }
  }

  // ── user_plan_progress conflict resolution ──────────────────────────

  async _mergeUserPlanProgress(sourceId, targetId) {
    const sourceRows = await db.query('SELECT * FROM user_plan_progress WHERE skill_id = ?', [sourceId]);
    const targetRows = await db.query('SELECT * FROM user_plan_progress WHERE skill_id = ?', [targetId]);
    const targetByUser = new Map(targetRows.map(r => [r.user_id, r]));

    for (const src of sourceRows) {
      const tgt = targetByUser.get(src.user_id);
      if (!tgt) {
        // No conflict — move
        await db.insert('UPDATE user_plan_progress SET skill_id = ? WHERE id = ?', [targetId, src.id]);
      } else {
        // Conflict — union completed_days, keep earliest enrolled_at, latest last_activity_at
        const srcDays = JSON.parse(src.completed_days || '[]');
        const tgtDays = JSON.parse(tgt.completed_days || '[]');
        const mergedDays = [...new Set([...srcDays, ...tgtDays])].sort((a, b) => a - b);
        const earliestEnrolled = this._earliest(src.enrolled_at, tgt.enrolled_at);
        const latestActivity = this._latest(src.last_activity_at, tgt.last_activity_at);

        await db.insert(
          `UPDATE user_plan_progress SET completed_days = ?, enrolled_at = ?, last_activity_at = ? WHERE id = ?`,
          [JSON.stringify(mergedDays), earliestEnrolled, latestActivity, tgt.id]
        );
        await db.insert('DELETE FROM user_plan_progress WHERE id = ?', [src.id]);
      }
    }
  }

  // ── user_learning_plans merge ───────────────────────────────────────
  //
  // Strategy differs by user type:
  //
  // Shared/free users (existing behavior):
  // - Completed days are immutable (user finished that day's work)
  // - Existing chunked/timestamped runs are immutable
  // - Avoid duplicate content_id families
  // - After locking immutable rows, remaining days realign toward the target shared plan
  //
  // Premium users (simplified winner-pick):
  // - Choose one canonical plan: the one with MORE completed days (tie-break: target)
  // - Repoint winner plan rows to target skill_id
  // - Delete loser plan rows
  // - Completed progress is always preserved via user_plan_progress union (step 3)

  async _mergeUserLearningPlans(sourceId, targetId, preMergeSourceProgress, preMergeTargetProgress) {
    const sourceRows = await db.query('SELECT * FROM user_learning_plans WHERE skill_id = ?', [sourceId]);
    const targetRows = await db.query('SELECT * FROM user_learning_plans WHERE skill_id = ?', [targetId]);

    // Group by user_id
    const sourceByUser = new Map();
    for (const r of sourceRows) {
      if (!sourceByUser.has(r.user_id)) sourceByUser.set(r.user_id, []);
      sourceByUser.get(r.user_id).push(r);
    }
    const targetByUser = new Map();
    for (const r of targetRows) {
      if (!targetByUser.has(r.user_id)) targetByUser.set(r.user_id, []);
      targetByUser.get(r.user_id).push(r);
    }

    // Determine which users are premium
    const allUserIds = [...new Set([...sourceByUser.keys(), ...targetByUser.keys()])];
    const premiumUsers = new Set();
    if (allUserIds.length > 0) {
      const placeholders = allUserIds.map(() => '?').join(', ');
      const users = await db.query(
        `SELECT id, subscription_status FROM users WHERE id IN (${placeholders})`,
        allUserIds
      );
      for (const u of users) {
        if (u.subscription_status === 'active') premiumUsers.add(u.id);
      }
    }

    // Use pre-merge progress (captured before user_plan_progress was unioned)
    const sourceCompletedByUser = new Map();
    for (const r of (preMergeSourceProgress || [])) {
      sourceCompletedByUser.set(r.user_id, new Set(JSON.parse(r.completed_days || '[]')));
    }
    const targetCompletedByUser = new Map();
    for (const r of (preMergeTargetProgress || [])) {
      targetCompletedByUser.set(r.user_id, new Set(JSON.parse(r.completed_days || '[]')));
    }

    // Get the target shared plan for realignment (used by shared/free merge)
    const sharedPlan = await db.query(
      'SELECT day_number, content_id, content_type, reason, review_status, review_title, review_body, timestamp_start_seconds, timestamp_end_seconds FROM learning_plans WHERE skill_id = ? ORDER BY day_number',
      [targetId]
    );
    const sharedByDay = new Map(sharedPlan.map(r => [r.day_number, r]));

    for (const [userId, srcPlans] of sourceByUser) {
      const tgtPlans = targetByUser.get(userId);
      const isPremium = premiumUsers.has(userId);

      if (isPremium) {
        await this._mergePremiumUserPlans(userId, sourceId, targetId, srcPlans, tgtPlans, sourceCompletedByUser, targetCompletedByUser);
        continue;
      }

      // Shared/free user merge (existing behavior)
      if (!tgtPlans) {
        const completedDays = sourceCompletedByUser.get(userId) || new Set();
        const immutableRows = srcPlans.filter(row => (
          completedDays.has(row.day_number) ||
          row.timestamp_start_seconds != null ||
          row.timestamp_end_seconds != null
        ));

        const mutableSourceByDay = new Map(
          srcPlans
            .filter(row => !completedDays.has(row.day_number) && row.timestamp_start_seconds == null && row.timestamp_end_seconds == null)
            .map(row => [row.day_number, row])
        );

        const usedContentFamilies = new Set(
          immutableRows.map(row => this._contentFamily(row.content_id)).filter(Boolean)
        );
        const mergedByDay = new Map();

        for (const row of immutableRows) {
          mergedByDay.set(row.day_number, this._planRowFields(row));
        }

        const fallbackSharedRows = Array.from(sharedByDay.values()).filter(row => row && row.content_id);
        const fallbackSourceRows = Array.from(mutableSourceByDay.values()).filter(row => row && row.content_id);

        for (let day = 1; day <= 30; day++) {
          if (mergedByDay.has(day)) continue;

          const sharedDay = sharedByDay.get(day);
          if (sharedDay && !sharedDay.content_id && sharedDay.content_type === 'review') {
            mergedByDay.set(day, this._planRowFields(sharedDay, day));
            continue;
          }
          const sharedFamily = this._contentFamily(sharedDay?.content_id);
          if (sharedDay && sharedDay.content_id && (!sharedFamily || !usedContentFamilies.has(sharedFamily))) {
            mergedByDay.set(day, this._planRowFields(sharedDay, day));
            if (sharedFamily) usedContentFamilies.add(sharedFamily);
            continue;
          }

          const sourceDay = mutableSourceByDay.get(day);
          if (sourceDay && !sourceDay.content_id && sourceDay.content_type === 'review') {
            mergedByDay.set(day, this._planRowFields(sourceDay, day));
            continue;
          }
          const sourceFamily = this._contentFamily(sourceDay?.content_id);
          if (sourceDay && sourceDay.content_id && (!sourceFamily || !usedContentFamilies.has(sourceFamily))) {
            mergedByDay.set(day, this._planRowFields(sourceDay, day));
            if (sourceFamily) usedContentFamilies.add(sourceFamily);
            continue;
          }

          const fallbackShared = fallbackSharedRows.find(row => {
            const family = this._contentFamily(row.content_id);
            return !family || !usedContentFamilies.has(family);
          });
          if (fallbackShared) {
            const family = this._contentFamily(fallbackShared.content_id);
            mergedByDay.set(day, this._planRowFields(fallbackShared, day));
            if (family) usedContentFamilies.add(family);
            continue;
          }

          const fallbackSource = fallbackSourceRows.find(row => {
            const family = this._contentFamily(row.content_id);
            return !family || !usedContentFamilies.has(family);
          });
          if (fallbackSource) {
            const family = this._contentFamily(fallbackSource.content_id);
            mergedByDay.set(day, this._planRowFields(fallbackSource, day));
            if (family) usedContentFamilies.add(family);
          }
        }

        await db.saveUserLearningPlan(userId, targetId, Array.from(mergedByDay.values()).sort((a, b) => a.day_number - b.day_number));

        for (const row of srcPlans) {
          await db.insert('DELETE FROM user_learning_plans WHERE id = ?', [row.id]);
        }
        continue;
      }

      // Conflict: merge carefully (shared/free user)
      const completedDays = targetCompletedByUser.get(userId) || new Set();
      const tgtByDay = new Map(tgtPlans.map(r => [r.day_number, r]));

      // Determine immutable target rows: completed days OR chunked/timestamped
      const immutableDays = new Set();
      for (const [day, row] of tgtByDay) {
        if (completedDays.has(day)) {
          immutableDays.add(day);
        } else if (row.timestamp_start_seconds != null || row.timestamp_end_seconds != null) {
          immutableDays.add(day);
        }
      }

      // Collect content_ids already used in immutable rows to avoid duplicates
      const usedContentFamilies = new Set();
      const mergedByDay = new Map();
      const srcByDay = new Map(srcPlans.map(r => [r.day_number, r]));
      for (const day of immutableDays) {
        const row = tgtByDay.get(day);
        if (row) {
          const family = this._contentFamily(row.content_id);
          if (family) usedContentFamilies.add(family);
          mergedByDay.set(day, this._planRowFields(row));
        }
      }

      const fallbackSharedRows = Array.from(sharedByDay.values()).filter(row => row && row.content_id);
      const fallbackTargetRows = Array.from(tgtByDay.values()).filter(row => row && row.content_id && !immutableDays.has(row.day_number));
      const fallbackSourceRows = Array.from(srcByDay.values()).filter(row => row && row.content_id && !immutableDays.has(row.day_number));

      // For non-immutable days (1-30), fully rebuild the remaining target plan, preferring shared alignment
      for (let day = 1; day <= 30; day++) {
        if (immutableDays.has(day)) continue; // locked

        const tryRow = (row) => {
          if (!row) return false;
          // Review days have null content_id — always allow them
          if (!row.content_id) {
            if (row.content_type === 'review') {
              mergedByDay.set(day, this._planRowFields(row, day));
              return true;
            }
            return false;
          }
          const family = this._contentFamily(row.content_id);
          if (family && usedContentFamilies.has(family)) return false;
          mergedByDay.set(day, this._planRowFields(row, day));
          if (family) usedContentFamilies.add(family);
          return true;
        };

        if (tryRow(sharedByDay.get(day))) continue;
        if (tryRow(tgtByDay.get(day))) continue;
        if (tryRow(srcByDay.get(day))) continue;
        if (tryRow(fallbackSharedRows.find(row => {
          const family = this._contentFamily(row.content_id);
          return !family || !usedContentFamilies.has(family);
        }))) continue;
        if (tryRow(fallbackTargetRows.find(row => {
          const family = this._contentFamily(row.content_id);
          return !family || !usedContentFamilies.has(family);
        }))) continue;
        tryRow(fallbackSourceRows.find(row => {
          const family = this._contentFamily(row.content_id);
          return !family || !usedContentFamilies.has(family);
        }));
      }

      await db.saveUserLearningPlan(
        userId,
        targetId,
        Array.from(mergedByDay.values()).sort((a, b) => a.day_number - b.day_number)
      );

      // Delete source rows for this user (they've been merged)
      for (const row of srcPlans) {
        await db.insert('DELETE FROM user_learning_plans WHERE id = ?', [row.id]);
      }
    }
  }

  // ── premium user plan merge (winner-pick) ──────────────────────────

  async _mergePremiumUserPlans(userId, sourceId, targetId, srcPlans, tgtPlans, sourceCompletedByUser, targetCompletedByUser) {
    if (!tgtPlans) {
      // Source-only: repoint to target
      for (const row of srcPlans) {
        await db.insert('UPDATE user_learning_plans SET skill_id = ? WHERE id = ?', [targetId, row.id]);
      }
      return;
    }

    if (!srcPlans || srcPlans.length === 0) {
      // Target-only: keep target (nothing to do)
      return;
    }

    // Both exist: pick winner by completed days count, tie-break → target
    const srcCompleted = sourceCompletedByUser.get(userId) || new Set();
    const tgtCompleted = targetCompletedByUser.get(userId) || new Set();

    const sourceWins = srcCompleted.size > tgtCompleted.size;

    if (sourceWins) {
      // Delete target plan rows, repoint source to target
      await db.insert('DELETE FROM user_learning_plans WHERE user_id = ? AND skill_id = ?', [userId, targetId]);
      for (const row of srcPlans) {
        await db.insert('UPDATE user_learning_plans SET skill_id = ? WHERE id = ?', [targetId, row.id]);
      }
    } else {
      // Keep target, delete source plan rows
      for (const row of srcPlans) {
        await db.insert('DELETE FROM user_learning_plans WHERE id = ?', [row.id]);
      }
    }
  }

  // ── review_submissions merge ───────────────────────────────────────

  async _mergePlanJobs(sourceId, targetId) {
    const sourceRows = await db.query('SELECT * FROM plan_jobs WHERE skill_id = ?', [sourceId]);
    const targetRows = await db.query('SELECT * FROM plan_jobs WHERE skill_id = ?', [targetId]);
    const targetByKey = new Set(targetRows.map(r => this._planJobConflictKey(r)));

    for (const src of sourceRows) {
      const key = this._planJobConflictKey(src);
      if (targetByKey.has(key)) {
        await db.insert('DELETE FROM plan_jobs WHERE id = ?', [src.id]);
      } else {
        await db.insert('UPDATE plan_jobs SET skill_id = ? WHERE id = ?', [targetId, src.id]);
      }
    }
  }

  async _mergePlanReviewContent(sourceId, targetId) {
    const sourceRows = await db.query('SELECT * FROM plan_review_content WHERE skill_id = ?', [sourceId]);
    const targetRows = await db.query('SELECT * FROM plan_review_content WHERE skill_id = ?', [targetId]);
    const targetByKey = new Set(targetRows.map(r => this._planReviewContentConflictKey(r)));

    for (const src of sourceRows) {
      const key = this._planReviewContentConflictKey(src);
      if (targetByKey.has(key)) {
        await db.insert('DELETE FROM plan_review_content WHERE id = ?', [src.id]);
      } else {
        await db.insert('UPDATE plan_review_content SET skill_id = ? WHERE id = ?', [targetId, src.id]);
      }
    }
  }

  async _mergeReviewSubmissions(sourceId, targetId) {
    const sourceRows = await db.query('SELECT * FROM review_submissions WHERE skill_id = ?', [sourceId]);
    const targetRows = await db.query('SELECT * FROM review_submissions WHERE skill_id = ?', [targetId]);
    const targetByKey = new Set(targetRows.map(r => `${r.user_id}:${r.day_number}`));

    for (const src of sourceRows) {
      const key = `${src.user_id}:${src.day_number}`;
      if (targetByKey.has(key)) {
        // Conflict: target wins — delete source submission and its answers
        await db.insert('DELETE FROM review_submission_answers WHERE submission_id = ?', [src.id]);
        await db.insert('DELETE FROM review_submissions WHERE id = ?', [src.id]);
      } else {
        // No conflict: repoint to target
        await db.insert('UPDATE review_submissions SET skill_id = ? WHERE id = ?', [targetId, src.id]);
      }
    }
  }

  // ── premium_plan_days merge ────────────────────────────────────────

  async _mergePremiumPlanDays(sourceId, targetId) {
    const sourceRows = await db.query('SELECT * FROM premium_plan_days WHERE skill_id = ?', [sourceId]);
    const targetRows = await db.query('SELECT * FROM premium_plan_days WHERE skill_id = ?', [targetId]);
    const targetByKey = new Set(targetRows.map(r => `${r.user_id}:${r.day_number}`));

    for (const src of sourceRows) {
      const key = `${src.user_id}:${src.day_number}`;
      if (targetByKey.has(key)) {
        // Conflict: target wins — delete source row
        await db.insert('DELETE FROM premium_plan_days WHERE id = ?', [src.id]);
      } else {
        // No conflict: repoint to target
        await db.insert('UPDATE premium_plan_days SET skill_id = ? WHERE id = ?', [targetId, src.id]);
      }
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────

  // Extract all plan-relevant fields from a row, preserving review fields.
  // If dayOverride is provided, use it instead of row.day_number.
  _planRowFields(row, dayOverride) {
    // review_body is stored as a JSON string in the DB, but saveUserLearningPlan
    // calls JSON.stringify on it again. Parse it here so it round-trips correctly.
    let reviewBody = row.review_body ?? null;
    if (typeof reviewBody === 'string') {
      try { reviewBody = JSON.parse(reviewBody); } catch (_) { /* keep as-is */ }
    }
    return {
      day_number: dayOverride ?? row.day_number,
      content_id: row.content_id,
      content_type: row.content_type,
      reason: row.reason,
      review_status: row.review_status ?? null,
      review_title: row.review_title ?? null,
      review_body: reviewBody,
      timestamp_start_seconds: row.timestamp_start_seconds ?? null,
      timestamp_end_seconds: row.timestamp_end_seconds ?? null,
    };
  }

  _planJobConflictKey(row) {
    return `${row.user_id ?? 'null'}:${row.day_number ?? 'null'}:${row.job_type ?? 'null'}:${row.status ?? 'null'}`;
  }

  _planReviewContentConflictKey(row) {
    return `${row.user_id ?? 'null'}:${row.day_number ?? 'null'}:${row.review_type ?? 'null'}`;
  }

  _resolveStatus(a, b) {
    const rankA = STATUS_RANK[a] || 0;
    const rankB = STATUS_RANK[b] || 0;
    return rankA >= rankB ? a : b;
  }

  _earliest(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
  }

  _latest(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
  }

  // Strip chunk suffixes like "yt_abc123_chunk2" → "yt_abc123" for dedup
  _contentFamily(contentId) {
    if (!contentId) return null;
    return contentId.replace(/_chunk\d+$/, '');
  }
}

module.exports = new SkillMergeService();
