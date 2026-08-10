# Smart Learning Analytics Dashboard

Smart Learning Analytics Dashboard is a research prototype for importing
educational datasets, mapping them to a canonical schema, executing analytical
tasks, rendering role-specific visualizations, and generating structured
AI-assisted explanations.

## Architecture

| Component | Technologies | Responsibility |
| --- | --- | --- |
| `Frontend/` | React, Vite, Recharts | Dataset import, dashboards, analytics, and visualization |
| `Backend/` | Node.js, Express, Prisma, PostgreSQL | Profiling, mapping, normalization, task execution, and AI proxying |
| `AIService/` | Python, FastAPI, Pydantic | Deterministic summaries, explanation strategies, validation, and safety filtering |

## Prerequisites

- Node.js and npm
- Python 3.10 or later
- PostgreSQL
- An OpenAI API key only when AI-generated explanations are enabled

## Configuration

Create local configuration from the provided examples. Never commit the
resulting `.env` files.

```powershell
Copy-Item Frontend/.env.example Frontend/.env
Copy-Item Backend/.env.example Backend/.env
Copy-Item AIService/.env.example AIService/.env
```

Review each value before starting the services. The default URLs assume:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`
- AI service: `http://localhost:8000`

## Install dependencies

```powershell
Set-Location Frontend
npm.cmd ci

Set-Location ../Backend
npm.cmd ci

Set-Location ../AIService
python -m pip install -r requirements.txt
```

## Run locally

Start each component in a separate terminal.

```powershell
# Terminal 1
Set-Location Backend
npm.cmd run dev

# Terminal 2
Set-Location AIService
python -m uvicorn main:app --reload --port 8000

# Terminal 3
Set-Location Frontend
npm.cmd run dev
```

Database migrations must be applied before using the import pipeline:

```powershell
Set-Location Backend
npm.cmd run generate
npm.cmd run migrate
```

## Verification

```powershell
Set-Location Frontend
npm.cmd test
npm.cmd run lint
npm.cmd run build

Set-Location ../Backend
npm.cmd test

Set-Location ..
python -m unittest discover -s AIService/tests -p "test_*.py"
```

## Data and results

Raw datasets, record-level outputs, model prompts, detailed judge artifacts,
and internal logs are not distributed in this repository. Public examples must
use synthetic or appropriately licensed data. Reviewed aggregate results and
their reproduction instructions will be published separately under `results/`.

## Project status

This repository is being prepared for an initial research-code release. The
public license, citation metadata, reviewed result bundle, and fully
self-contained example fixtures must be completed before release.
