import express from "express";
import {
  getStudentsController,
  getStudentSummaryController,
  getClassesController,
} from "../controllers/students.controller.js";

const router = express.Router();

/**
 * @swagger
 * /api/students:
 *   get:
 *     summary: Get all students
 *     description: Returns a paginated list of students enrolled in a specific class or batch. Used for populating dropdowns and list views.
 *     tags:
 *       - Students
 *     parameters:
 *       - in: query
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the import batch
 *         example: "SAMPLE_OULAD"
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *         description: Optional class filter
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of students per page
 *     responses:
 *       200:
 *         description: A paginated list of students
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: "boolean", example: true }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page: { type: "integer", example: 1 }
 *                     pageSize: { type: "integer", example: 50 }
 *                     total: { type: "integer", example: 6 }
 *                     totalPages: { type: "integer", example: 1 }
 *                     hasNext: { type: "boolean", example: false }
 *                     hasPrev: { type: "boolean", example: false }
 *                 count: { type: "integer", example: 6 }
 *                 students:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/StudentSummary'
 *       400:
 *         description: Missing batchId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", getStudentsController);

/**
 * GET /api/students/:studentId/summary?batchId=...&classId=...
 * Quick-stats summary for one student: demographics + performance metrics.
 * Must be declared BEFORE /:studentId to avoid "summary" matching as id.
 * (Not needed here since "summary" is a sub-path, but good practice to note)
 */
/**
 * @swagger
 * /api/students/{studentId}/summary:
 *   get:
 *     summary: Get student summary
 *     description: Returns a quick-stats summary for one student in a specific class/batch. Used by StudentDetailCard.
 *     tags:
 *       - Students
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the student
 *         example: "STU_001"
 *       - in: query
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the import batch
 *         example: "SAMPLE_OULAD"
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *         description: Optional class context
 *     responses:
 *       200:
 *         description: Detailed student summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: "boolean", example: true }
 *                 student:
 *                   $ref: '#/components/schemas/StudentSummary'
 *                 enrollment:
 *                   type: object
 *                 performance:
 *                   type: object
 *                   properties:
 *                     avg_score: { type: "number", example: 81 }
 *                     assessment_count: { type: "integer", example: 3 }
 *                     passed_count: { type: "integer", example: 3 }
 *                     pass_rate: { type: "number", example: 1.0 }
 *       404:
 *         description: Student not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:studentId/summary", getStudentSummaryController);

export default router;
