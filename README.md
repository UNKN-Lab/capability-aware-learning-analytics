# Capability-Aware Learning Analytics

*Evidence-Grounded AI Explanation for Heterogeneous Educational Data*

Capability-Aware Learning Analytics is a research prototype for heterogeneous
educational data. It maps imported datasets to a canonical educational schema,
validates which analytical tasks are supported by the available evidence,
executes deterministic analyses, renders role-specific visualizations, and
generates structured, evidence-grounded AI explanations.

This repository provides the public-facing implementation and aggregate
evaluation results accompanying the research paper.

## How to cite

If you found our work useful, please cite us.

For the capability-aware learning analytics architecture, task-availability
validation method, evidence-grounded AI explanation pipeline, or evaluation
artifacts released in this repository, please cite:

Gia-Bao Nguyen-Luong, Ngoc-Chau Le-Thi, and Hung-Nghiep Tran.
*Capability-Aware Learning Analytics with Evidence-Grounded AI Explanation for
Heterogeneous Educational Data*. Future Data and Security Engineering
(FDSE 2026), Springer, 2026. DOI and online publication link forthcoming.

```bibtex
@inproceedings{nguyenluong2026capability,
  author    = {Nguyen-Luong, Gia-Bao and
               Le-Thi, Ngoc-Chau and
               Tran, Hung-Nghiep},
  title     = {Capability-Aware Learning Analytics with
               Evidence-Grounded AI Explanation for
               Heterogeneous Educational Data},
  booktitle = {Future Data and Security Engineering},
  publisher = {Springer},
  year      = {2026},
  note      = {Accepted at FDSE 2026}
}
```

The publication URL and DOI will be added when the official Springer
proceedings record becomes available. When using the UCI Student Performance
dataset or OULAD, please also cite the corresponding original dataset
publication.

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

## Reproducing the paper results

The public reproduction package reconstructs the paper-facing aggregate tables
from sanitized evaluation records and documents fresh reruns from the official
UCI and OULAD datasets. See [`REPRODUCIBILITY.md`](REPRODUCIBILITY.md) for the
scope, commands, expected outputs, and reproducibility boundaries.

## Data and results

Raw datasets, record-level outputs, model prompts, detailed judge artifacts,
and internal logs are not distributed in this repository. Public examples must
use synthetic or appropriately licensed data. Reviewed aggregate results,
scope notes, and machine-readable paper tables are available under
[`results/`](results/).

## Project status

This repository contains the public-facing research prototype and reviewed
aggregate evaluation results. Raw datasets, detailed evaluation artifacts,
model logs, and internal research documents are maintained separately.

A public license, citation metadata, and self-contained example fixtures will
be added before the official open-source release.
