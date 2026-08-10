import prisma from "../lib/prisma.js";
import { safeRound, computePassRate } from "../utils/math.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER 1: GET /api/students
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/students?batchId=...&classId=...
 *
 * Returns a flat list of students enrolled in a class/batch.
 * Used by frontend: StudentPicker, StudentComparePicker dropdowns.
 *
 * Design: Uses Prisma ORM (not raw SQL) — this is a simple relational
 * lookup, not an analytical query. Raw SQL is reserved for sqlExecution
 * (analytics). ORM here gives type safety and cleaner code.
 *
 * Flattening: enrollment + student fields are merged into one object
 * per row — frontend doesn't need to know about the join.
 *
 * Query params:
 *   batchId   (required) — import batch UUID
 *   classId   (optional) — filter to specific class
 *   page      (optional) — 1-based page number (default: 1)
 *   pageSize  (optional) — items per page (default: 50, max: 200)
 *
 * Pagination is REQUIRED because OULAD has ~32K students.
 * Without classId filter + no pagination → 32K rows per response.
 * Default pageSize=50 is tuned for dropdown UX (fast load, sufficient choice).
 */
export async function getStudentsController(req, res) {
  try {
    const { batchId, classId } = req.query;

    // Pagination params
    const page     = Math.max(1, parseInt(req.query.page)     || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 50));
    const skip     = (page - 1) * pageSize;

    if (!batchId) {
      return res.status(400).json({ success: false, error: "batchId is required." });
    }

    const where = { batch_id: batchId };
    if (classId) where.class_id = classId;

    // Run count + data fetch in parallel for efficient pagination
    const [total, enrollments] = await Promise.all([
      prisma.enrollment.count({ where }),
      prisma.enrollment.findMany({
        where,
        select: {
          enrollment_id:          true,
          class_id:               true,
          final_outcome:          true,
          absences:               true,
          studytime:              true,
          previous_attempt_count: true,
          student: {
            select: {
              student_id:         true,
              gender:             true,
              age_group:          true,
              age_years:          true,
              source_dataset:     true,
              highest_education:  true,
              socioeconomic_band: true,
            },
          },
        },
        orderBy: { student_id: "asc" },
        skip,
        take: pageSize,
      }),
    ]);

    // Flatten: merge student fields up to enrollment level
    // Frontend expects a single flat object, not nested student/enrollment
    const students = enrollments.map((e) => ({
      enrollment_id:          e.enrollment_id,
      class_id:               e.class_id,
      final_outcome:          e.final_outcome,
      absences:               e.absences,
      studytime:              e.studytime,
      previous_attempt_count: e.previous_attempt_count,
      ...e.student, // student_id, gender, age_group, ...
    }));

    return res.status(200).json({
      success:    true,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext:    page * pageSize < total,
        hasPrev:    page > 1,
      },
      count:    enrollments.length,
      students,
    });
  } catch (err) {
    console.error("[getStudentsController]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER 2: GET /api/students/:studentId/summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/students/:studentId/summary?batchId=...&classId=...
 *
 * Returns a quick-stats summary for one student in a specific class/batch.
 * Used by frontend: StudentDetailCard, pre-execution context panel.
 *
 * Response sections:
 *   student    — demographic + FE profile fields
 *   enrollment — registration & behavioral fields
 *   performance — aggregated score stats (avg, pass_rate, assessment_count)
 *
 * Why separate from GET /api/students?
 *   The list endpoint is lightweight (for dropdowns — many items, few fields).
 *   The summary endpoint is richer (for detail panel — one item, many fields).
 *   Separation avoids over-fetching in the dropdown case.
 *
 * Query params:
 *   batchId  (required)
 *   classId  (optional) — needed for multi-class students
 */
export async function getStudentSummaryController(req, res) {
  try {
    const { studentId } = req.params;
    const { batchId, classId } = req.query;

    if (!batchId) {
      return res.status(400).json({ success: false, error: "batchId is required." });
    }

    // ── Step 1: Find enrollment + student profile ───────────────────────────
    const enrollmentWhere = { student_id: studentId, batch_id: batchId };
    if (classId) enrollmentWhere.class_id = classId;

    const enrollment = await prisma.enrollment.findFirst({
      where: enrollmentWhere,
      include: {
        student: {
          select: {
            student_id:          true,
            gender:              true,
            age_group:           true,
            age_years:           true,
            source_dataset:      true,
            highest_education:   true,
            socioeconomic_band:  true,
            disability_flag:     true,
            // Stored FE fields (may be null if ETL didn't run FE step)
            lifestyle_risk_score:   true,
            support_score:          true,
            social_balance_score:   true,
            family_stability_score: true,
            disadvantage_score:     true,
          },
        },
      },
    });

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        error:   `Student "${studentId}" not found in this batch/class context.`,
      });
    }

    // ── Step 2: Aggregate assessment performance ────────────────────────────
    // Two separate Prisma queries:
    //   - aggregate() for avg_score + total count (Prisma built-in)
    //   - count() for pass_flag = true (Boolean can't be summed in aggregate)
    const [arStats, passedCount] = await Promise.all([
      prisma.assessmentResult.aggregate({
        where: {
          enrollment_id: enrollment.enrollment_id,
          batch_id:      batchId,
        },
        _avg:   { score_normalized: true },
        _count: { result_id: true },
      }),
      prisma.assessmentResult.count({
        where: {
          enrollment_id: enrollment.enrollment_id,
          batch_id:      batchId,
          pass_flag:     true,
        },
      }),
    ]);

    const totalCount = arStats._count.result_id;
    const avgScore   = arStats._avg.score_normalized;

    return res.status(200).json({
      success: true,
      student: enrollment.student,
      enrollment: {
        enrollment_id:          enrollment.enrollment_id,
        class_id:               enrollment.class_id,
        final_outcome:          enrollment.final_outcome,
        absences:               enrollment.absences,
        studytime:              enrollment.studytime,
        previous_attempt_count: enrollment.previous_attempt_count,
        study_load_credits:     enrollment.study_load_credits,
        registration_lead_time: enrollment.registration_lead_time,
      },
      performance: {
        avg_score:        safeRound(avgScore, 2),         // ← centralized
        assessment_count: totalCount,
        passed_count:     passedCount,
        pass_rate:        computePassRate(passedCount, totalCount), // ← centralized
      },
    });
  } catch (err) {
    console.error("[getStudentSummaryController]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER 3: GET /api/classes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/classes?batchId=...
 *
 * Returns all classes in a batch with enrollment counts.
 * Used by frontend: ClassPicker dropdown, dataset overview panel.
 *
 * student_count is included via Prisma's _count feature — no raw SQL needed.
 * The _count.enrollments field maps to the Enrollment[] relation on Class model.
 *
 * Query params:
 *   batchId (required)
 */
export async function getClassesController(req, res) {
  try {
    const { batchId } = req.query;

    if (!batchId) {
      return res.status(400).json({ success: false, error: "batchId is required." });
    }

    const classes = await prisma.class.findMany({
      where: { batch_id: batchId },
      select: {
        class_id:       true,
        course_id:      true,
        source_dataset: true,
        class_run:      true,
        semester:       true,
        academic_year:  true,
        duration_days:  true,
        delivery_mode:  true,
        _count: {
          select: { enrollments: true }, // count of enrolled students
        },
      },
      orderBy: { class_id: "asc" },
    });

    // Flatten: rename _count.enrollments → student_count for clean API surface
    const result = classes.map((c) => ({
      class_id:       c.class_id,
      course_id:      c.course_id,
      source_dataset: c.source_dataset,
      class_run:      c.class_run,
      semester:       c.semester,
      academic_year:  c.academic_year,
      duration_days:  c.duration_days,
      delivery_mode:  c.delivery_mode,
      student_count:  c._count.enrollments,
    }));

    return res.status(200).json({
      success: true,
      count:   result.length,
      classes: result,
    });
  } catch (err) {
    console.error("[getClassesController]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
