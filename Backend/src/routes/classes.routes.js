import express from "express";
import { getClassesController } from "../controllers/students.controller.js";

const router = express.Router();

/**
 * @swagger
 * /api/classes:
 *   get:
 *     summary: Get all classes
 *     description: Returns a list of all classes in the specified dataset batch, including the enrollment counts. Used to populate the ClassPicker on the frontend.
 *     tags:
 *       - Classes
 *     parameters:
 *       - in: query
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the import batch
 *         example: "SAMPLE_OULAD"
 *     responses:
 *       200:
 *         description: List of classes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: "boolean", example: true }
 *                 count: { type: "integer", example: 1 }
 *                 classes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       class_id: { type: "string", example: "CLASS_101" }
 *                       course_id: { type: "string", example: "AAA" }
 *                       source_dataset: { type: "string", example: "OULAD" }
 *                       class_run: { type: "string", example: "2013J" }
 *                       student_count: { type: "integer", example: 6 }
 *       400:
 *         description: Missing batchId parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", getClassesController);

export default router;
