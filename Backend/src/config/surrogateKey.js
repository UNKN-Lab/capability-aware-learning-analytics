import { createHash } from 'crypto'

/**
 * Creates a unique MD5 hash based on provided parts.
 * Used for generating stable 24-character surrogate keys for all entities.
 */
export function buildId(...parts) {
  const raw = parts.filter(Boolean).join('::')
  return createHash('md5').update(raw).digest('hex').slice(0, 24)
}

export const surrogateKeyGenerators = {
  student_id: (batchId, rawStudentId) => buildId(batchId, rawStudentId),
  course_id: (batchId, rawCourseId) => buildId(batchId, rawCourseId),
  class_id: (courseId, classRun) => buildId(courseId, classRun),
  enrollment_id: (studentId, classId) => buildId(studentId, classId),
  assessment_id: (classId, assessmentName) => buildId(classId, assessmentName),
  result_id: (studentId, assessmentId) => buildId(studentId, assessmentId),
  event_id: (classId, resourceId) => buildId(classId, resourceId),
  engagement_id: (studentId, eventId, eventDay) => buildId(studentId, eventId, eventDay),
  ef_id: (enrollmentId) => buildId(enrollmentId)
};
