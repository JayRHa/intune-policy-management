from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import asyncio
from auth import check_auth, get_graph_token, logout
from graph_client import graph_client
from llm_service import (
    generate_description,
    load_llm_settings,
    save_llm_settings,
)
from models import GenerateRequest, GenerationResult, LLMSettings
from policy_fetcher import fetch_all_policies, fetch_policy_details, update_policy_description, POLICY_ENDPOINTS
from conflict_analyzer import analyze_conflicts


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await graph_client.close()


app = FastAPI(title="Intune PolicyManagement", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/auth/status")
async def auth_status():
    return check_auth()


@app.post("/api/auth/login")
async def auth_login():
    try:
        token = await asyncio.to_thread(get_graph_token)
        await graph_client.close()
        return {"status": "authenticated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/auth/logout")
async def auth_logout():
    try:
        logout()
        await graph_client.close()
        return {"status": "logged_out"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/policies")
async def get_policies():
    try:
        policies = await fetch_all_policies()
        return {"policies": [p.model_dump() for p in policies]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/policies/{policy_type}/{policy_id}")
async def get_policy_details_endpoint(policy_type: str, policy_id: str):
    if policy_type not in POLICY_ENDPOINTS:
        raise HTTPException(status_code=400, detail=f"Unknown policy type: {policy_type}")
    try:
        details = await fetch_policy_details(policy_type, policy_id)
        return details
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SingleGenerateRequest(BaseModel):
    policy_id: str
    policy_type: str
    system_prompt: str | None = None
    template: str | None = None
    custom_instructions: str | None = None


@app.post("/api/generate-single")
async def generate_single(request: SingleGenerateRequest):
    """Generate description for a single policy. Called per-policy for progress tracking."""
    if request.policy_type not in POLICY_ENDPOINTS:
        raise HTTPException(status_code=400, detail=f"Unknown policy type: {request.policy_type}")
    try:
        details = await fetch_policy_details(request.policy_type, request.policy_id)
        policy_name = details.get("displayName") or details.get("name") or "Unknown"

        description = await generate_description(
            policy_data=details,
            policy_name=policy_name,
            policy_type=POLICY_ENDPOINTS[request.policy_type]["label"],
            system_prompt=request.system_prompt,
            template=request.template,
            custom_instructions=request.custom_instructions,
        )

        return GenerationResult(
            policy_id=request.policy_id,
            policy_name=policy_name,
            policy_type=request.policy_type,
            generated_description=description,
        ).model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class UpdateDescriptionRequest(BaseModel):
    policy_id: str
    policy_type: str
    description: str


class BulkUpdateRequest(BaseModel):
    updates: list[UpdateDescriptionRequest]


@app.post("/api/update-descriptions")
async def update_descriptions(request: BulkUpdateRequest):
    """Update policy descriptions in Intune."""
    results = []
    errors = []

    for update in request.updates:
        try:
            await update_policy_description(
                update.policy_type, update.policy_id, update.description
            )
            results.append({
                "policy_id": update.policy_id,
                "policy_type": update.policy_type,
                "status": "updated",
            })
        except Exception as e:
            errors.append({
                "policy_id": update.policy_id,
                "policy_type": update.policy_type,
                "error": str(e),
            })

    return {"results": results, "errors": errors}


@app.get("/api/settings")
async def get_settings():
    return load_llm_settings().model_dump()


@app.put("/api/settings")
async def update_settings(llm_settings: LLMSettings):
    save_llm_settings(llm_settings)
    return {"status": "saved"}


@app.get("/api/analyze-conflicts")
async def analyze_conflicts_endpoint(include_unique: bool = False):
    """Analyze all policies and find overlapping/duplicate settings."""
    try:
        conflicts = await analyze_conflicts(include_unique=include_unique)
        return {"conflicts": conflicts, "total": len(conflicts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/policy-types")
async def get_policy_types():
    return {k: v["label"] for k, v in POLICY_ENDPOINTS.items()}
