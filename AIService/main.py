"""
AI Explanation Service  FastAPI Application
============================================
Phase 3 | Learning Analytics Thesis Project

Architecture:
  Node.js Backend    POST /explain    This service    OpenAI API
                        (proxy)         (LLM + Strategy)

Endpoint: POST /explain
  - Receives enriched payload from Node proxy (includes task metadata)
  - Routes to correct ExplanationStrategy class
  - Returns structured AIExplainResponse (Pydantic-validated)
  - On any failure  returns DEGRADED response (never crashes)

Run:
  uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
import logging
from dotenv import load_dotenv

# Load .env before initializing any OpenAI clients in strategies
load_dotenv()

from schemas import ExplainRequest, ExplainResponse
from strategies.factory import ExplanationStrategyFactory
from strategies.base import BaseExplanationStrategy
from safety import SafetyFilter

#  Logging 
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ai_service")


#  App Lifecycle 

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI Explanation Service starting up...")
    logger.info(
        f"ExplanationStrategyFactory initialized - "
        f"{len(ExplanationStrategyFactory.list_strategies())} strategies registered"
    )
    yield
    logger.info("AI Explanation Service shutting down.")


app = FastAPI(
    title="Learning Analytics  AI Explanation Service",
    description=(
        "Internal FastAPI service that generates structured AI explanations "
        "for learning analytics tasks. Receives enriched task metadata from "
        "the Node.js proxy and returns validated ExplainResponse objects."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


#  Health Check 

@app.get("/health")
async def health():
    """
    Health probe  Node proxy checks this before forwarding requests.
    Returns 200 + service info so Node can decide to call or degrade immediately.
    """
    return {
        "status": "ok",
        "service": "ai-explanation-service",
        "version": "1.0.0",
        "strategies_available": ExplanationStrategyFactory.list_strategies(),
    }


#  Main Endpoint 

@app.post("/explain", response_model=ExplainResponse)
async def explain(request: ExplainRequest):
    """
    Core explanation endpoint.

    Flow:
      1. Validate incoming request (Pydantic  already done by FastAPI)
      2. Route to correct strategy via ExplanationStrategyFactory
      3. Build system + user prompt
      4. Call OpenAI API
      5. Parse + validate LLM response
      6. Apply safety filter
      7. Return ExplainResponse

    On any exception at steps 36  return DEGRADED response.
    This endpoint NEVER raises a 500  the Node proxy relies on this guarantee.
    """
    start_ms = int(time.time() * 1000)
    logger.info(
        f"[explain] task_id={request.task_id} "
        f"strategy={request.explanation_strategy} "
        f"audience={request.target_audience}"
    )

    try:
        #  Step 1: Get strategy 
        strategy = ExplanationStrategyFactory.get_strategy(request.explanation_strategy)

        #  Step 2: Build prompts 
        system_prompt = strategy.build_system_prompt(request)
        user_prompt   = strategy.build_user_prompt(request)
        user_prompt   = _append_task_focus_hints(user_prompt, request)

        logger.info(
            f"[explain] Prompts built  "
            f"system={len(system_prompt)} chars, user={len(user_prompt)} chars"
        )

        #  Step 3: Call LLM 
        raw_response = await strategy.call_llm(system_prompt, user_prompt, request)

        #  Step 4: Apply safety filter 
        safety_flags = SafetyFilter.apply(raw_response.get("explanation", {}))

        #  Step 5: Build final response 
        latency_ms = int(time.time() * 1000) - start_ms
        response   = strategy.build_response(
            request      = request,
            raw          = raw_response,
            safety_flags = safety_flags,
            latency_ms   = latency_ms,
        )

        logger.info(
            f"[explain] OK  task={request.task_id} "
            f"confidence={response.confidence.level} "
            f"latency={latency_ms}ms"
        )
        return response

    except Exception as exc:
        latency_ms = int(time.time() * 1000) - start_ms
        logger.error(
            f"[explain] DEGRADED  task={request.task_id} "
            f"error={type(exc).__name__}: {exc} "
            f"latency={latency_ms}ms"
        )
        return _build_degraded_response(request, latency_ms, str(exc))


#  Degraded Response Builder 

def _append_task_focus_hints(user_prompt: str, req: ExplainRequest) -> str:
    """
    Appends task-level guidance from registry (actionable question + aiPromptHint)
    so the strategy prompt stays aligned with what the chart is expected to show.
    """
    extras = []
    if req.actionable_question:
        extras.append(f"PRIMARY ACTIONABLE QUESTION:\n{req.actionable_question}")
    if req.ai_prompt_hint:
        extras.append(
            "TASK-SPECIFIC FOCUS (from task registry):\n"
            f"{req.ai_prompt_hint}\n"
            "Use only the fields present in the dataset rows."
        )

    if not extras:
        return user_prompt

    return f"{user_prompt}\n\n" + "\n\n".join(extras)


def _build_degraded_response(req: ExplainRequest, latency_ms: int, reason: str) -> dict:
    """
    Returns a DEGRADED ExplainResponse.
    Node proxy forwards this to Frontend which renders <AIDegradedBanner />.
    Chart rendering is NEVER blocked by this.
    """
    return {
        "task_id":              req.task_id,
        "execution_id":         req.execution_id,
        "degraded":             True,
        "explanation": {
            "summary":                  "AI explanation is temporarily unavailable.",
            "insights":                 [],
            "educational_implications": [],
            "recommendations":          [],
            "warnings":                 [f"LLM service error: {reason}"],
        },
        "confidence": {
            "level":    None,
            "reason":   None,
            "based_on": [],
        },
        "explanation_type":     req.explanation_strategy,
        "explanation_strategy": req.explanation_strategy,
        **BaseExplanationStrategy.get_summary_response_metadata(req),
        "safety_flags":         [],
        "meta": {
            "model":       None,
            "latency_ms":  latency_ms,
            "token_usage": None,
            "strategy":    req.explanation_strategy,
            "granularity": req.analysis_context.granularity if req.analysis_context else None,
            "cost_usd":    None,
        },
    }
