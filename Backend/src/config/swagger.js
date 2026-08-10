import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Learning Analytics System API",
      version: "3.0.0",
      description: [
        "API documentation for the Learning Analytics Thesis Backend.",
        "",
        "**Architecture:** Metadata-driven. All 53 analytical tasks are declared in `taskRegistry.json`.",
        "Each task carries `visualization_config`, `explanation_strategy`, `query_labels`, and",
        "`analysis_context` — making both the ChartRenderer and Python AI Service purely declarative.",
        "",
        "**Phase 3 status:** STEP 2 complete (all 53 tasks annotated). STEP 3 in progress.",
      ].join("\n"),
      contact: {
        name: "Learning Analytics Thesis Project",
      },
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Local Development Server",
      },
    ],
    tags: [
      { name: "System",    description: "Health checks and system status" },
      { name: "Analytics", description: "Core analytical engine — POST /api/analytics/run" },
      { name: "AI",        description: "AI explanation service — POST /api/ai/explain (Node proxy → Python FastAPI)" },
      { name: "Tasks",     description: "Task registry — metadata, capability validation" },
      { name: "Students",  description: "Student lookup and quick-stats summary" },
      { name: "Classes",   description: "Class list and dataset context" },
      { name: "Datasets",  description: "Dataset management — activate, switch, delete, rename" },
      { name: "Import",    description: "Data ingestion pipeline — CSV upload and ETL" },
    ],
    components: {
      schemas: {

        // ── SHARED PRIMITIVES ───────────────────────────────────────────────

        ErrorResponse: {
          type: "object",
          description: "Standard error envelope returned for all 4xx/5xx responses.",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code:    { type: "string",  example: "INVALID_REQUEST" },
                message: { type: "string",  example: "taskId is required." },
              },
            },
          },
          example: {
            success: false,
            error: { code: "TASK_NOT_FOUND", message: "No task found with id 'X-Y99'." },
          },
        },

        // ── TASK REGISTRY SCHEMAS ───────────────────────────────────────────

        SemanticRoles: {
          type: "object",
          description: "Declares the semantic meaning of chart axes. Used by the AI service to frame explanations and by adapters to transform data correctly.",
          required: ["x", "y"],
          properties: {
            x: {
              type: "string",
              enum: ["time", "category", "cohort", "student", "ranking", "assessment"],
              description: "Semantic role of the X axis.",
              example: "time",
            },
            y: {
              type: "string",
              enum: [
                "performance_metric", "engagement_metric", "behavioral_metric",
                "risk_metric", "count_metric", "ratio_metric",
              ],
              description: "Semantic role of the Y axis.",
              example: "performance_metric",
            },
            color: {
              type: "string",
              nullable: true,
              description: "Semantic role of the color dimension (optional).",
              example: "risk_metric",
            },
          },
        },

        VisualizationConfig: {
          type: "object",
          description: "Declarative chart rendering config. ChartRenderer reads this to pick adapter + variant — no internal field guessing.",
          required: ["x_field", "y_field", "variant", "semantic_roles"],
          properties: {
            x_field:      { type: "string", nullable: true,  example: "assessment_order" },
            y_field:      { type: "string", nullable: true,  example: "score_normalized" },
            series_field: { type: "string", nullable: true,  example: null },
            color_field:  { type: "string", nullable: true,  example: null },
            orientation:  {
              type: "string", nullable: true,
              enum: ["horizontal", "vertical", null],
              example: "horizontal",
            },
            variant: {
              type: "string",
              enum: ["categorical", "grouped", "stacked", "ranked", "histogram",
                     "default", "multi_series", "colored",
                     "week_activity", "score_matrix"],
              example: "default",
            },
            x_label:      { type: "string", nullable: true,  example: "Assessment Order" },
            y_label:      { type: "string", nullable: true,  example: "Normalized Score" },
            semantic_roles: { $ref: "#/components/schemas/SemanticRoles" },
          },
        },

        AnalysisContext: {
          type: "object",
          description: "Defines the data granularity and aggregation scope. Used by the Python AI service to select appropriate language (e.g. 'week-over-week' vs 'long-term').",
          required: ["granularity", "aggregation_level"],
          properties: {
            granularity: {
              type: "string",
              enum: ["weekly", "per_assessment", "semester", "cohort_aggregate"],
              description: "Time resolution of the data.",
              example: "per_assessment",
            },
            aggregation_level: {
              type: "string",
              enum: ["student", "cohort", "comparison", "instructor"],
              description: "Scope of the aggregation.",
              example: "student",
            },
          },
        },

        TaskMetadata: {
          type: "object",
          description: "Full metadata for one analytical task from taskRegistry.json. Frontend uses this to render charts and request AI explanations without hardcoding.",
          properties: {
            taskId:               { type: "string", example: "S-T01" },
            taskName:             { type: "string", example: "Score trend analysis" },
            scope:                { type: "string", example: "1 student" },
            actionableQuestion:   { type: "string", example: "Am I getting better or worse over time?" },
            datasetCompatibility: {
              type: "string",
              enum: ["both", "OULAD_only", "UCI_only"],
              example: "both",
            },
            viz_type: {
              type: "string",
              enum: ["line_chart", "bar_chart", "scatter_plot", "pie_chart", "heatmap", "table"],
              example: "line_chart",
            },
            visualization_config: { $ref: "#/components/schemas/VisualizationConfig" },
            explanation_strategy: {
              type: "string",
              enum: ["trend", "comparison", "distribution", "correlation", "risk", "behavioral", "ranking"],
              description: "Determines which Python Strategy class builds the AI prompt.",
              example: "trend",
            },
            target_audience: {
              type: "array",
              items: {
                type: "string",
                enum: ["student", "instructor", "academic_advisor", "admin"],
              },
              description: "Audience(s) for this task. AI adjusts tone per audience.",
              example: ["student"],
            },
            query_labels: {
              type: "array",
              items: { type: "string" },
              description: "Named labels for each query result set. Index 0 = primary dataset for ChartRenderer.",
              example: ["score_trend"],
            },
            analysis_context: { $ref: "#/components/schemas/AnalysisContext" },
            aiPromptHint: {
              type: "string",
              description: "Human-readable hint for AI prompt construction (used by Python service).",
              example: "Identify whether student is improving or declining. Reference performance_trend slope direction and magnitude.",
            },
          },
          example: {
            taskId: "S-T01",
            taskName: "Score trend analysis",
            scope: "1 student",
            actionableQuestion: "Am I getting better or worse over time?",
            datasetCompatibility: "both",
            viz_type: "line_chart",
            visualization_config: {
              x_field: "assessment_order",
              y_field: "score_normalized",
              series_field: null,
              color_field: null,
              orientation: "horizontal",
              variant: "default",
              x_label: "Assessment Order",
              y_label: "Normalized Score",
              semantic_roles: { x: "time", y: "performance_metric" },
            },
            explanation_strategy: "trend",
            target_audience: ["student"],
            query_labels: ["score_trend"],
            analysis_context: { granularity: "per_assessment", aggregation_level: "student" },
          },
        },

        // ── ANALYTICS API SCHEMAS ───────────────────────────────────────────

        AnalyticsRequest: {
          type: "object",
          required: ["taskId", "params"],
          description: "Request body to execute an analytical task.",
          properties: {
            taskId: {
              type: "string",
              description: "ID of the task to run (from taskRegistry.json).",
              example: "S-T01",
            },
            params: {
              type: "object",
              description: "SQL parameters. Required fields vary by task scope.",
              required: ["batch_id"],
              properties: {
                batch_id:      { type: "string",  description: "Active import batch ID.",                      example: "SAMPLE_OULAD" },
                class_id:      { type: "string",  description: "Required for most tasks.",                     example: "CLASS_101"    },
                student_id:    { type: "string",  description: "Required for 1-student scope tasks.",          example: "STU_001"      },
                enrollment_id: { type: "string",  description: "Required for OULAD engagement tasks (S-T05, S-T06).", example: "ENR_001" },
                s1:            { type: "string",  description: "First student ID for comparison tasks (A-C0x).",     example: "STU_001" },
                s2:            { type: "string",  description: "Second student ID for comparison tasks (A-C0x).",    example: "STU_002" },
              },
            },
          },
          example: {
            taskId: "S-T01",
            params: {
              batch_id:   "SAMPLE_OULAD",
              class_id:   "CLASS_101",
              student_id: "STU_001",
            },
          },
        },

        DataQuality: {
          type: "object",
          description: "Data quality signals from the 4-layer Capability Validator.",
          properties: {
            status:            { type: "string", enum: ["executable", "partial", "insufficient"], example: "executable" },
            confidence:        { type: "string", enum: ["HIGH", "MEDIUM", "LOW"],                 example: "HIGH"       },
            confidence_reason: { type: "string", example: "45 students × 5 assessments across 9 weeks." },
            warnings:          { type: "array",  items: { type: "string" }, example: []           },
          },
        },

        AnalyticsExecutionMeta: {
          type: "object",
          description: "Execution metadata returned alongside dataset results. Separated from data payload to allow future extension (cache_hit, sql_time, row_count).",
          properties: {
            taskId:          { type: "string",  example: "S-T01"   },
            isMultiQuery:    { type: "boolean", example: false      },
            queryCount:      { type: "integer", example: 1         },
            executionTimeMs: { type: "integer", example: 42        },
            queryHash:       { type: "string",  example: "a3f2b1c0"},
            dataQuality:     { $ref: "#/components/schemas/DataQuality" },
          },
        },

        AnalyticsResponse: {
          type: "object",
          description: "Response from POST /api/analytics/run. `datasets` is a named dict keyed by `query_labels` from the task definition. Frontend reads `datasets[query_labels[0]]` as primary data.",
          properties: {
            success:     { type: "boolean", example: true },
            executionId: { type: "string",  example: "exec_1747405614_a3f2b1c0" },
            taskId:      { type: "string",  example: "S-T01" },
            datasets: {
              type: "object",
              description: "Named dataset map. Keys are from task.query_labels[]. Single-query → 1 key. Multi-query → N keys.",
              additionalProperties: {
                type: "array",
                items: { type: "object" },
              },
              example: {
                score_trend: [
                  { assessment_order: 1, score_normalized: 78.5, pass_flag: true  },
                  { assessment_order: 2, score_normalized: 65.0, pass_flag: false },
                  { assessment_order: 3, score_normalized: 81.2, pass_flag: true  },
                ],
              },
            },
            meta: { $ref: "#/components/schemas/AnalyticsExecutionMeta" },
          },
          example: {
            success:     true,
            executionId: "exec_1747405614_a3f2b1c0",
            taskId:      "S-T01",
            datasets: {
              score_trend: [
                { assessment_order: 1, score_normalized: 78.5, pass_flag: true  },
                { assessment_order: 2, score_normalized: 65.0, pass_flag: false },
                { assessment_order: 3, score_normalized: 81.2, pass_flag: true  },
              ],
            },
            meta: {
              taskId: "S-T01",
              isMultiQuery: false,
              queryCount: 1,
              executionTimeMs: 42,
              queryHash: "a3f2b1c0",
              dataQuality: {
                status: "executable",
                confidence: "HIGH",
                confidence_reason: "45 students × 5 assessments across 9 weeks.",
                warnings: [],
              },
            },
          },
        },

        // ── AI SERVICE SCHEMAS ──────────────────────────────────────────────

        AIExplainRequest: {
          type: "object",
          required: ["taskId", "executionId", "datasets", "meta"],
          description: "Request body for POST /api/ai/explain. Node proxy enriches this with task metadata before forwarding to Python FastAPI.",
          properties: {
            taskId:      { type: "string", example: "S-T01" },
            executionId: { type: "string", example: "exec_1747405614_a3f2b1c0" },
            datasets: {
              type: "object",
              description: "Named dataset map from the analytics run response (same shape as AnalyticsResponse.datasets).",
              additionalProperties: { type: "array", items: { type: "object" } },
              example: {
                score_trend: [
                  { assessment_order: 1, score_normalized: 78.5 },
                  { assessment_order: 2, score_normalized: 65.0 },
                ],
              },
            },
            meta: {
              type: "object",
              properties: {
                dataQuality: { $ref: "#/components/schemas/DataQuality" },
              },
            },
            studentContext: {
              type: "object",
              nullable: true,
              description: "Optional demographic context passed to AI for personalised framing.",
              properties: {
                student_id: { type: "string", example: "STU_001" },
                gender:     { type: "string", example: "M" },
                age_group:  { type: "string", example: "35-55" },
              },
            },
          },
        },

        EvidenceItem: {
          type: "object",
          description: "Structured evidence item within an Insight. Enables future chart-to-insight click-linking.",
          required: ["metric", "value", "comparison"],
          properties: {
            metric:     { type: "string", example: "score_normalized" },
            value:      { oneOf: [{ type: "number" }, { type: "string" }], example: 61.2 },
            comparison: {
              type: "string",
              enum: ["baseline", "up_from_previous", "down_from_previous", "peak", "trough", "stable"],
              example: "down_from_previous",
            },
            delta:   { type: "number", nullable: true, example: -14.2 },
            context: { type: "string", nullable: true, example: "assessment_order=3" },
          },
        },

        Insight: {
          type: "object",
          description: "A single analytical finding with structured evidence.",
          required: ["title", "description", "severity"],
          properties: {
            title:       { type: "string", example: "Score Decline Mid-Semester" },
            description: { type: "string", example: "Average scores dropped from 78.5 to 65.0 between assessments 1 and 2." },
            severity:    { type: "string", enum: ["low", "medium", "high"], example: "medium" },
            evidence:    { type: "array", items: { $ref: "#/components/schemas/EvidenceItem" } },
          },
        },

        Recommendation: {
          type: "object",
          required: ["priority", "action", "rationale"],
          properties: {
            priority:  { type: "string", enum: ["low", "medium", "high"], example: "medium" },
            action:    { type: "string", example: "Review engagement patterns during assessments 2–3 alongside score data." },
            rationale: { type: "string", example: "Score decline may correlate with reduced platform activity during that period." },
          },
        },

        ConfidenceInfo: {
          type: "object",
          required: ["level", "reason", "based_on"],
          properties: {
            level:  { type: "string", enum: ["HIGH", "MEDIUM", "LOW"], nullable: true, example: "MEDIUM" },
            reason: { type: "string", nullable: true, example: "5 students × 3 assessments across 4 weeks — adequate but limited range." },
            based_on: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "sufficient_data", "sparse_data", "limited_temporal_range",
                  "single_student", "missing_fe_fields", "dataset_mismatch",
                ],
              },
              example: ["sparse_data", "limited_temporal_range"],
            },
          },
        },

        AIMeta: {
          type: "object",
          description: "AI execution metadata. Stored in ai_explanation_log for thesis cost analysis.",
          properties: {
            model:       { type: "string",  nullable: true, example: "gpt-4o-mini"    },
            latency_ms:  { type: "integer", nullable: true, example: 1240             },
            token_usage: {
              type: "object",
              nullable: true,
              properties: {
                prompt_tokens:     { type: "integer", example: 312 },
                completion_tokens: { type: "integer", example: 187 },
                total_tokens:      { type: "integer", example: 499 },
              },
            },
            strategy:    { type: "string",  nullable: true, example: "trend"    },
            granularity: { type: "string",  nullable: true, example: "per_assessment" },
            cost_usd:    { type: "number",  nullable: true, example: 0.00029    },
          },
        },

        AIExplanationBody: {
          type: "object",
          required: ["summary", "insights", "educational_implications", "recommendations", "warnings"],
          properties: {
            summary: {
              type: "string",
              description: "1-sentence TL;DR of the analysis.",
              example: "The student's normalized assessment scores show a declining trend from assessment 1 to 2, with a partial recovery at assessment 3.",
            },
            insights: {
              type: "array",
              items: { $ref: "#/components/schemas/Insight" },
              description: "2–4 structured findings with evidence.",
            },
            educational_implications: {
              type: "array",
              items: { type: "string" },
              example: ["The pattern suggests increased assessment difficulty or reduced preparation time mid-semester."],
            },
            recommendations: {
              type: "array",
              items: { $ref: "#/components/schemas/Recommendation" },
            },
            warnings: {
              type: "array",
              items: { type: "string" },
              description: "Data quality warnings surfaced to the user. Empty if confidence=HIGH.",
              example: [],
            },
          },
        },

        AIExplainResponse: {
          type: "object",
          description: "Response from POST /api/ai/explain. Frontend checks `degraded` first — if true, render AIDegradedBanner instead of normal panel. Chart rendering is NEVER blocked by AI failure.",
          properties: {
            task_id:              { type: "string",  example: "S-T01" },
            execution_id:         { type: "string",  example: "exec_1747405614_a3f2b1c0" },
            degraded:             { type: "boolean", example: false },
            explanation:          { $ref: "#/components/schemas/AIExplanationBody" },
            confidence:           { $ref: "#/components/schemas/ConfidenceInfo" },
            explanation_type:     { type: "string",  example: "temporal" },
            explanation_strategy: { type: "string",  example: "trend" },
            safety_flags:         { type: "array",   items: { type: "string" }, example: [] },
            meta:                 { $ref: "#/components/schemas/AIMeta" },
          },
          example: {
            task_id:      "S-T01",
            execution_id: "exec_1747405614_a3f2b1c0",
            degraded:     false,
            explanation: {
              summary: "The student's normalized assessment scores show a declining trend from assessment 1 to 2, with a partial recovery at assessment 3.",
              insights: [
                {
                  title: "Score Decline at Assessment 2",
                  description: "Normalized score dropped from 78.5 to 65.0 between assessments 1 and 2.",
                  severity: "medium",
                  evidence: [
                    { metric: "score_normalized", value: 65.0, comparison: "down_from_previous", delta: -13.5, context: "assessment_order=2" },
                    { metric: "score_normalized", value: 78.5, comparison: "baseline",            delta: null,  context: "assessment_order=1" },
                  ],
                },
              ],
              educational_implications: ["The pattern suggests increased difficulty or reduced preparation time mid-semester."],
              recommendations: [
                {
                  priority: "medium",
                  action: "Review engagement patterns during assessment 2–3 alongside score data.",
                  rationale: "Score decline may correlate with reduced platform activity during that period.",
                },
              ],
              warnings: [],
            },
            confidence: {
              level: "HIGH",
              reason: "45 students × 5 assessments — sufficient data range.",
              based_on: ["sufficient_data"],
            },
            explanation_type:     "temporal",
            explanation_strategy: "trend",
            safety_flags:         [],
            meta: {
              model: "gpt-4o-mini", latency_ms: 1240,
              token_usage: { prompt_tokens: 312, completion_tokens: 187, total_tokens: 499 },
              strategy: "trend", granularity: "per_assessment", cost_usd: 0.00029,
            },
          },
        },

        AIDegradedResponse: {
          type: "object",
          description: "Returned when the Python AI service is unavailable (timeout, crash). Frontend renders AIDegradedBanner. Chart rendering continues normally.",
          properties: {
            task_id:      { type: "string",  example: "S-T01" },
            execution_id: { type: "string",  example: "exec_1747405614_a3f2b1c0" },
            degraded:     { type: "boolean", example: true },
            explanation: {
              type: "object",
              properties: {
                summary:                  { type: "string", example: "AI explanation is temporarily unavailable." },
                insights:                 { type: "array",  items: {}, example: [] },
                educational_implications: { type: "array",  items: {}, example: [] },
                recommendations:          { type: "array",  items: {}, example: [] },
                warnings:                 { type: "array",  items: { type: "string" }, example: ["LLM service timeout. Please try again later."] },
              },
            },
            confidence: {
              type: "object",
              properties: {
                level:    { type: "string",  nullable: true, example: null },
                reason:   { type: "string",  nullable: true, example: null },
                based_on: { type: "array",   items: {},      example: []   },
              },
            },
            safety_flags: { type: "array", items: {}, example: [] },
            meta: {
              type: "object",
              properties: {
                model:       { type: "string",  nullable: true, example: null  },
                latency_ms:  { type: "integer", example: 15001 },
                token_usage: { type: "object",  nullable: true, example: null  },
                strategy:    { type: "string",  nullable: true, example: null  },
                granularity: { type: "string",  nullable: true, example: null  },
                cost_usd:    { type: "number",  nullable: true, example: null  },
              },
            },
          },
        },

        // ── CAPABILITY VALIDATION SCHEMAS ───────────────────────────────────

        TaskValidationResult: {
          type: "object",
          description: "Result of the 4-layer Capability Validator (A→D) for one task.",
          properties: {
            task_id:              { type: "string",  example: "S-T01" },
            executable:           { type: "boolean", example: true    },
            status:               { type: "string",  enum: ["executable", "partial", "insufficient"], example: "executable" },
            confidence:           { type: "string",  enum: ["HIGH", "MEDIUM", "LOW"], example: "HIGH" },
            confidence_reason:    { type: "string",  example: "45 students × 5 assessments across 9 weeks." },
            warnings:             { type: "array",   items: { type: "string" }, example: [] },
            missing_requirements: { type: "array",   items: { type: "string" }, example: [] },
            layer_results:        {
              type: "object",
              description: "Layer A (table exists), B (FE fields), C (row count), D (cross-table) results.",
            },
          },
        },

        // ── STUDENT SCHEMAS ─────────────────────────────────────────────────

        StudentSummary: {
          type: "object",
          description: "Core student record enriched with enrollment context.",
          properties: {
            student_id:    { type: "string", example: "STU_001" },
            gender:        { type: "string", example: "M" },
            age_group:     { type: "string", example: "35-55" },
            region:        { type: "string", example: "East Midlands Region" },
            enrollment_id: { type: "string", example: "ENR_001" },
            class_id:      { type: "string", example: "CLASS_101" },
            final_outcome: { type: "string", enum: ["Pass", "Fail", "Withdrawn", "Distinction"], example: "Pass" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.js", "./src/server.js"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
