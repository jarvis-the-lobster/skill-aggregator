#!/usr/bin/env node

/**
 * purge-ted.js — One-time script to remove all TED content from the database.
 * 
 * TED scraper was removed 2026-04-03 due to poor search relevance
 * (e.g. "political division" for piano, "chimpanzees" for ASL).
 * 
 * This script cleans up:
 *   1. user_learning_plans — per-user plan entries referencing TED content
 *   2. learning_plans — shared plan entries referencing TED content
 *   3. user_interactions — any ratings on TED content
 *   4. content — the TED content rows themselves
 *   5. scrape_log — TED scrape history
 * 
 * Usage:
 *   railway run node src/scripts/purge-ted.js          (production)
 *   railway run node src/scripts/purge-ted.js --dry-run (preview only)
 * 
 * Safe to run multiple times — idempotent.
 */

const path = require('path');
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../../../database/skills.db');
const DRY_RUN = process.argv.includes('--dry-run');

console.log('═══════════════════════════════════════════════════');
console.log('  🧹 TED Content Purge Script');
console.log('═══════════════════════════════════════════════════');
console.log(`  Mode:     ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🔴 LIVE (will delete data)'}`);
console.log(`  DB Path:  ${DB_PATH}`);
console.log(`  Started:  ${new Date().toISOString()}`);
console.log('═══════════════════════════════════════════════════\n');

const sqlite3 = require('sqlite3').verbose();

function openDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.error(`❌ Failed to open database: ${err.message}`);
        console.error(`   Path: ${DB_PATH}`);
        console.error('   Make sure DB_PATH is set correctly or run via railway run');
        reject(err);
      } else {
        console.log('✅ Database connection opened\n');
        resolve(db);
      }
    });
  });
}

function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
}

async function main() {
  const db = await openDb();

  try {
    // ─── Step 1: Audit what we're about to delete ─────────────────────────

    console.log('📊 AUDIT — Counting TED data across all tables...\n');

    // Content
    const tedContent = await query(db, "SELECT COUNT(*) as count FROM content WHERE id LIKE 'ted_%'");
    console.log(`   content rows with ted_ prefix:          ${tedContent[0].count}`);

    // Show breakdown by skill (top 10)
    const bySkill = await query(db, `
      SELECT skill_id, COUNT(*) as count 
      FROM content 
      WHERE id LIKE 'ted_%' 
      GROUP BY skill_id 
      ORDER BY count DESC 
      LIMIT 10
    `);
    if (bySkill.length > 0) {
      console.log('   Top skills by TED content count:');
      bySkill.forEach(row => console.log(`     - ${row.skill_id}: ${row.count} items`));
    }

    // Sample some titles so we can verify we're deleting the right stuff
    const sampleContent = await query(db, "SELECT id, skill_id, title FROM content WHERE id LIKE 'ted_%' ORDER BY RANDOM() LIMIT 5");
    if (sampleContent.length > 0) {
      console.log('\n   Sample TED content (random 5):');
      sampleContent.forEach(row => console.log(`     [${row.skill_id}] ${row.title}`));
    }

    // Learning plans
    const tedPlans = await query(db, "SELECT COUNT(*) as count FROM learning_plans WHERE content_id LIKE 'ted_%'");
    console.log(`\n   learning_plans referencing TED:          ${tedPlans[0].count}`);

    // User learning plans
    const tedUserPlans = await query(db, "SELECT COUNT(*) as count FROM user_learning_plans WHERE content_id LIKE 'ted_%'");
    console.log(`   user_learning_plans referencing TED:     ${tedUserPlans[0].count}`);

    // User interactions (ratings on TED content)
    const tedRatings = await query(db, "SELECT COUNT(*) as count FROM user_interactions WHERE content_id LIKE 'ted_%'");
    console.log(`   user_interactions (ratings) on TED:      ${tedRatings[0].count}`);

    // Scrape log
    const tedLogs = await query(db, "SELECT COUNT(*) as count FROM scrape_log WHERE source = 'ted'");
    console.log(`   scrape_log entries for TED:              ${tedLogs[0].count}`);

    const totalRows = tedContent[0].count + tedPlans[0].count + tedUserPlans[0].count + tedRatings[0].count + tedLogs[0].count;
    console.log(`\n   ─────────────────────────────────────────`);
    console.log(`   TOTAL ROWS TO DELETE:                    ${totalRows}`);

    if (totalRows === 0) {
      console.log('\n✅ Nothing to delete — database is already clean. Exiting.');
      db.close();
      process.exit(0);
    }

    // ─── Step 2: Delete (or preview) ───────────────────────────────────────

    if (DRY_RUN) {
      console.log('\n🔍 DRY RUN — no changes made. Run without --dry-run to execute.\n');
      db.close();
      process.exit(0);
    }

    console.log('\n🗑️  DELETING...\n');

    // Delete in FK-safe order: children first, then parent content

    console.log('   [1/5] Deleting from user_learning_plans...');
    const r1 = await run(db, "DELETE FROM user_learning_plans WHERE content_id LIKE 'ted_%'");
    console.log(`         ✅ Deleted ${r1.changes} rows`);

    console.log('   [2/5] Deleting from learning_plans...');
    const r2 = await run(db, "DELETE FROM learning_plans WHERE content_id LIKE 'ted_%'");
    console.log(`         ✅ Deleted ${r2.changes} rows`);

    console.log('   [3/5] Deleting from user_interactions...');
    const r3 = await run(db, "DELETE FROM user_interactions WHERE content_id LIKE 'ted_%'");
    console.log(`         ✅ Deleted ${r3.changes} rows`);

    console.log('   [4/5] Deleting from content...');
    const r4 = await run(db, "DELETE FROM content WHERE id LIKE 'ted_%'");
    console.log(`         ✅ Deleted ${r4.changes} rows`);

    console.log('   [5/5] Deleting from scrape_log...');
    const r5 = await run(db, "DELETE FROM scrape_log WHERE source = 'ted'");
    console.log(`         ✅ Deleted ${r5.changes} rows`);

    // ─── Step 3: Verify ─────────────────────────────────────────────────────

    console.log('\n🔎 VERIFICATION — Checking for any remaining TED data...\n');

    const remaining = await query(db, "SELECT COUNT(*) as count FROM content WHERE id LIKE 'ted_%'");
    const remainingPlans = await query(db, "SELECT COUNT(*) as count FROM learning_plans WHERE content_id LIKE 'ted_%'");
    const remainingUserPlans = await query(db, "SELECT COUNT(*) as count FROM user_learning_plans WHERE content_id LIKE 'ted_%'");
    const remainingRatings = await query(db, "SELECT COUNT(*) as count FROM user_interactions WHERE content_id LIKE 'ted_%'");
    const remainingLogs = await query(db, "SELECT COUNT(*) as count FROM scrape_log WHERE source = 'ted'");

    console.log(`   content:              ${remaining[0].count} remaining`);
    console.log(`   learning_plans:       ${remainingPlans[0].count} remaining`);
    console.log(`   user_learning_plans:  ${remainingUserPlans[0].count} remaining`);
    console.log(`   user_interactions:    ${remainingRatings[0].count} remaining`);
    console.log(`   scrape_log:           ${remainingLogs[0].count} remaining`);

    const allClear = [remaining, remainingPlans, remainingUserPlans, remainingRatings, remainingLogs]
      .every(r => r[0].count === 0);

    // ─── Summary ─────────────────────────────────────────────────────────────

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  📋 SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  user_learning_plans:  ${r1.changes} deleted`);
    console.log(`  learning_plans:       ${r2.changes} deleted`);
    console.log(`  user_interactions:    ${r3.changes} deleted`);
    console.log(`  content:              ${r4.changes} deleted`);
    console.log(`  scrape_log:           ${r5.changes} deleted`);
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  TOTAL:                ${r1.changes + r2.changes + r3.changes + r4.changes + r5.changes} rows deleted`);
    console.log(`  Status:               ${allClear ? '✅ ALL CLEAR' : '⚠️  SOME ROWS REMAIN — investigate!'}`);
    console.log(`  Finished:             ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════\n');

    db.close();
    process.exit(allClear ? 0 : 1);

  } catch (err) {
    console.error('\n❌ FATAL ERROR:', err.message);
    console.error('   Stack:', err.stack);
    db.close();
    process.exit(1);
  }
}

main();
