import { normalizeText } from "../utils/textUtils.js";

// ==========================================
// HELPERS
// ==========================================

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function maxNumber(values) {
  const clean = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (clean.length === 0) return null;
  return Math.max(...clean);
}

function sumNumbers(values) {
  const clean = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (clean.length === 0) return 0;
  return clean.reduce((sum, value) => sum + value, 0);
}

// ==========================================
// MAIN SERVICE (Phase 2 Utility)
// Note: This service is not used during the Phase 1 ETL import pipeline.
// Cross-table derived metrics are computed dynamically via SQL during Phase 2 analytics.
// ==========================================

export function computeCohortStats(normalizedEntities) {
  const { enrollment = [], engagement = [], event = [] } = normalizedEntities;

  // Group engagements by enrollment
  const engagementByEnrollment = new Map();
  for (const eng of engagement) {
    if (!eng.enrollment_id) continue;
    if (!engagementByEnrollment.has(eng.enrollment_id)) {
      engagementByEnrollment.set(eng.enrollment_id, []);
    }
    engagementByEnrollment.get(eng.enrollment_id).push(eng);
  }

  const classTotalEngagementCounts = new Map(); // class_id -> number[]
  const classActiveDayCounts = new Map();       // class_id -> number[]
  const classAbsenceCounts = new Map();         // class_id -> number[]
  const resourceTypesByClass = new Map();       // class_id -> Set<string>

  // 1. Gather Resource Types from Event model
  for (const ev of event) {
    if (!ev.class_id || !ev.resource_type) continue;
    if (!resourceTypesByClass.has(ev.class_id)) {
      resourceTypesByClass.set(ev.class_id, new Set());
    }
    resourceTypesByClass.get(ev.class_id).add(normalizeText(ev.resource_type));
  }

  // 2. Gather Student Metrics per Class
  for (const enrol of enrollment) {
    if (!enrol.class_id) continue;
    const cid = enrol.class_id;

    if (!classTotalEngagementCounts.has(cid)) classTotalEngagementCounts.set(cid, []);
    if (!classActiveDayCounts.has(cid)) classActiveDayCounts.set(cid, []);
    if (!classAbsenceCounts.has(cid)) classAbsenceCounts.set(cid, []);

    const engRows = engagementByEnrollment.get(enrol.enrollment_id) || [];
    
    // Total Engagement
    const totalEng = sumNumbers(engRows.map(r => toNumber(r.engagement_count)));
    if (totalEng > 0) classTotalEngagementCounts.get(cid).push(totalEng);

    // Active Days
    const activeDaysSet = new Set();
    for (const r of engRows) {
      const day = toNumber(r.event_day);
      if (day !== null) activeDaysSet.add(day);
    }
    if (activeDaysSet.size > 0) classActiveDayCounts.get(cid).push(activeDaysSet.size);

    // Absences (either from enrollment directly or from engagement rows)
    let absenceCount = toNumber(enrol.absences);
    if (absenceCount === null && engRows.length > 0) {
        // Fallback if not available at enrollment level
        const maxEngAbsence = maxNumber(engRows.map(r => toNumber(r.absence_count)));
        absenceCount = maxEngAbsence;
    }
    if (absenceCount !== null) classAbsenceCounts.get(cid).push(absenceCount);
  }

  // 3. Compute Cohort Stats map
  const stats = {
    classStats: new Map(), // class_id -> { maxAbsence, maxTotalEng, maxActiveDay, resourceTypeCount }
    globalStats: {
      maxTotalEngagementCount: maxNumber(Array.from(classTotalEngagementCounts.values()).flat()),
      maxActiveDayCount: maxNumber(Array.from(classActiveDayCounts.values()).flat()),
      maxAbsenceCount: maxNumber(Array.from(classAbsenceCounts.values()).flat())
    }
  };

  for (const [classId, counts] of classTotalEngagementCounts.entries()) {
    stats.classStats.set(classId, {
      maxTotalEngagementCount: maxNumber(counts),
      maxActiveDayCount: maxNumber(classActiveDayCounts.get(classId) || []),
      maxAbsenceCount: maxNumber(classAbsenceCounts.get(classId) || []),
      resourceTypeCount: (resourceTypesByClass.get(classId) || new Set()).size
    });
  }

  return stats;
}
