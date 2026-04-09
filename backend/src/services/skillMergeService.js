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

    // Execute
    if (isRename) {
      await this._executeRename(sourceId, targetId, source[0]);
    } else {
      await this._executeMerge(sourceId, targetId);
    }

    // Verify source is gone
    const check = await db.query('SELECT id FROM skills WHERE id = ?', [sourceId]);
    if (check.length > 0) throw new Error('Post-merge verification failed: source skill still exists');

    return { dryRun: false, mode: isRename ? 'rename' : 'merge', sourceId, targetId, ...report };
  }

  // ── impact report (read-only) ───────────────────────────────────────

  async _buildReport(sourceId, targetId, isRename) {
    const [
      sourceContent, targetContent,
      sourceUserCourses, targetUserCourses,
      sourceProgress, targetProgress,
      sourceUserPlans, targetUserPlans,
      sourceLearningPlans, targetLearningPlans,
      sourceScrapeLogs
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

    // 3. User plan progress: merge completed_days
    await this._mergeUserPlanProgress(sourceId, targetId);

    // 4. User learning plans: merge carefully
    await this._mergeUserLearningPlans(sourceId, targetId);

    // 5. Learning plans: keep target if it has rows, otherwise move source
    const targetPlanCount = await db.query('SELECT COUNT(*) as cnt FROM learning_plans WHERE skill_id = ?', [targetId]);
    if (targetPlanCount[0].cnt === 0) {
      await db.insert('UPDATE learning_plans SET skill_id = ? WHERE skill_id = ?', [targetId, sourceId]);
    } else {
      await db.insert('DELETE FROM learning_plans WHERE skill_id = ?', [sourceId]);
    }

    // 6. Scrape log: leave on source for historical accuracy

    // 7. Delete source skill
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
  // Rules:
  // - Completed days are immutable (user finished that day's work)
  // - Existing chunked/timestamped runs are immutable
  // - Avoid duplicate content_id families
  // - After locking immutable rows, remaining days realign toward the target shared plan
  //
  // For users with NO target plan: simple repoint.
  // For users WITH target plan: lock immutable target rows, fill gaps from source or shared plan.

  async _mergeUserLearningPlans(sourceId, targetId) {
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

    // Get completed days per user for target skill (to know which days are immutable)
    const targetProgressRows = await db.query('SELECT * FROM user_plan_progress WHERE skill_id = ?', [targetId]);
    const completedByUser = new Map();
    for (const r of targetProgressRows) {
      completedByUser.set(r.user_id, new Set(JSON.parse(r.completed_days || '[]')));
    }

    // Get the target shared plan for realignment
    const sharedPlan = await db.query(
      'SELECT day_number, content_id, content_type, reason, timestamp_start_seconds, timestamp_end_seconds FROM learning_plans WHERE skill_id = ? ORDER BY day_number',
      [targetId]
    );
    const sharedByDay = new Map(sharedPlan.map(r => [r.day_number, r]));

    for (const [userId, srcPlans] of sourceByUser) {
      const tgtPlans = targetByUser.get(userId);

      if (!tgtPlans) {
        const sourceProgress = await db.query(
          'SELECT * FROM user_plan_progress WHERE user_id = ? AND skill_id = ?',
          [userId, sourceId]
        );
        const completedDays = new Set(JSON.parse(sourceProgress[0]?.completed_days || '[]'));
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
          mergedByDay.set(row.day_number, {
            day_number: row.day_number,
            content_id: row.content_id,
            content_type: row.content_type,
            reason: row.reason,
            timestamp_start_seconds: row.timestamp_start_seconds ?? null,
            timestamp_end_seconds: row.timestamp_end_seconds ?? null,
          });
        }

        const fallbackSharedRows = Array.from(sharedByDay.values()).filter(row => row && row.content_id);
        const fallbackSourceRows = Array.from(mutableSourceByDay.values()).filter(row => row && row.content_id);

        for (let day = 1; day <= 30; day++) {
          if (mergedByDay.has(day)) continue;

          const sharedDay = sharedByDay.get(day);
          const sharedFamily = this._contentFamily(sharedDay?.content_id);
          if (sharedDay && sharedDay.content_id && (!sharedFamily || !usedContentFamilies.has(sharedFamily))) {
            mergedByDay.set(day, {
              day_number: day,
              content_id: sharedDay.content_id,
              content_type: sharedDay.content_type,
              reason: sharedDay.reason,
              timestamp_start_seconds: sharedDay.timestamp_start_seconds ?? null,
              timestamp_end_seconds: sharedDay.timestamp_end_seconds ?? null,
            });
            if (sharedFamily) usedContentFamilies.add(sharedFamily);
            continue;
          }

          const sourceDay = mutableSourceByDay.get(day);
          const sourceFamily = this._contentFamily(sourceDay?.content_id);
          if (sourceDay && sourceDay.content_id && (!sourceFamily || !usedContentFamilies.has(sourceFamily))) {
            mergedByDay.set(day, {
              day_number: day,
              content_id: sourceDay.content_id,
              content_type: sourceDay.content_type,
              reason: sourceDay.reason,
              timestamp_start_seconds: sourceDay.timestamp_start_seconds ?? null,
              timestamp_end_seconds: sourceDay.timestamp_end_seconds ?? null,
            });
            if (sourceFamily) usedContentFamilies.add(sourceFamily);
            continue;
          }

          const fallbackShared = fallbackSharedRows.find(row => {
            const family = this._contentFamily(row.content_id);
            return !family || !usedContentFamilies.has(family);
          });
          if (fallbackShared) {
            const family = this._contentFamily(fallbackShared.content_id);
            mergedByDay.set(day, {
              day_number: day,
              content_id: fallbackShared.content_id,
              content_type: fallbackShared.content_type,
              reason: fallbackShared.reason,
              timestamp_start_seconds: fallbackShared.timestamp_start_seconds ?? null,
              timestamp_end_seconds: fallbackShared.timestamp_end_seconds ?? null,
            });
            if (family) usedContentFamilies.add(family);
            continue;
          }

          const fallbackSource = fallbackSourceRows.find(row => {
            const family = this._contentFamily(row.content_id);
            return !family || !usedContentFamilies.has(family);
          });
          if (fallbackSource) {
            const family = this._contentFamily(fallbackSource.content_id);
            mergedByDay.set(day, {
              day_number: day,
              content_id: fallbackSource.content_id,
              content_type: fallbackSource.content_type,
              reason: fallbackSource.reason,
              timestamp_start_seconds: fallbackSource.timestamp_start_seconds ?? null,
              timestamp_end_seconds: fallbackSource.timestamp_end_seconds ?? null,
            });
            if (family) usedContentFamilies.add(family);
          }
        }

        await db.saveUserLearningPlan(userId, targetId, Array.from(mergedByDay.values()).sort((a, b) => a.day_number - b.day_number));

        for (const row of srcPlans) {
          await db.insert('DELETE FROM user_learning_plans WHERE id = ?', [row.id]);
        }
        continue;
      }

      // Conflict: merge carefully
      const completedDays = completedByUser.get(userId) || new Set();
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
      for (const day of immutableDays) {
        const row = tgtByDay.get(day);
        if (row && row.content_id) usedContentFamilies.add(this._contentFamily(row.content_id));
      }

      // For non-immutable days (1-30), try to fill from shared plan, avoiding content duplication
      for (let day = 1; day <= 30; day++) {
        if (immutableDays.has(day)) continue; // locked

        const sharedDay = sharedByDay.get(day);
        if (sharedDay && sharedDay.content_id && !usedContentFamilies.has(this._contentFamily(sharedDay.content_id))) {
          // Realign to shared plan
          await db.insert(
            `INSERT OR REPLACE INTO user_learning_plans
             (user_id, skill_id, day_number, content_id, content_type, reason, timestamp_start_seconds, timestamp_end_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, targetId, day, sharedDay.content_id, sharedDay.content_type, sharedDay.reason,
             sharedDay.timestamp_start_seconds ?? null, sharedDay.timestamp_end_seconds ?? null]
          );
          usedContentFamilies.add(this._contentFamily(sharedDay.content_id));
        }
        // If no shared plan entry or content already used, leave existing target row (if any)
      }

      // Delete source rows for this user (they've been merged)
      for (const row of srcPlans) {
        await db.insert('DELETE FROM user_learning_plans WHERE id = ?', [row.id]);
      }
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────

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
