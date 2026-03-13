const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { requireAuth } = require('../middleware/auth');

const VALID_STATUSES = ['active', 'paused', 'completed'];

// POST /api/courses/enroll/:skillId — enroll current user
router.post('/enroll/:skillId', requireAuth, async (req, res) => {
  try {
    const { skillId } = req.params;
    const skill = await db.getSkillById(skillId);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });

    const course = await db.enrollCourse(req.user.id, skillId);
    res.json({ enrolled: true, course });
  } catch (err) {
    console.error('Enroll error:', err);
    res.status(500).json({ error: 'Failed to enroll' });
  }
});

// DELETE /api/courses/enroll/:skillId — unenroll
router.delete('/enroll/:skillId', requireAuth, async (req, res) => {
  try {
    await db.unenrollCourse(req.user.id, req.params.skillId);
    res.json({ enrolled: false });
  } catch (err) {
    console.error('Unenroll error:', err);
    res.status(500).json({ error: 'Failed to unenroll' });
  }
});

// GET /api/courses/my — all enrolled courses with skill details
router.get('/my', requireAuth, async (req, res) => {
  try {
    const courses = await db.getMyCourses(req.user.id);
    res.json({ courses });
  } catch (err) {
    console.error('Get my courses error:', err);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// GET /api/courses/enrollment/:skillId — check enrollment status (guest-safe)
router.get('/enrollment/:skillId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) return res.json({ enrolled: false, course: null });
    const { verifyToken } = require('../services/authService');
    const decoded = verifyToken(token);
    if (!decoded) return res.json({ enrolled: false, course: null });
    const course = await db.getCourseEnrollment(decoded.userId, req.params.skillId);
    res.json({ enrolled: !!course, course: course || null });
  } catch (err) {
    res.json({ enrolled: false, course: null });
  }
});

// PATCH /api/courses/:skillId/status — update status
router.patch('/:skillId/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active, paused, or completed.' });
    }
    await db.updateCourseStatus(req.user.id, req.params.skillId, status);
    const course = await db.getCourseEnrollment(req.user.id, req.params.skillId);
    res.json({ course });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
