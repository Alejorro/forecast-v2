# CLAUDE.md

## Project
Internal forecast management tool for DOT4.

This is a local/internal application for commercial forecast tracking.
It is not a SaaS product and does not require complex architecture.

## Core goals
- Replace Excel workflow with a simpler internal app
- Improve manual transaction entry and editing
- Ensure forecast calculations are correct
- Provide clear operational dashboards

## Tech constraints
- Frontend: React + Vite + Tailwind
- Backend: Node + Express
- Database: SQLite
- Keep architecture simple
- Avoid overengineering

## Business logic constraints
- Forecast is based on TCV weighted by stage probability
- Stage is defined ONLY by stage_label
- stage_percent is derived (never stored)
- Transactions can be assigned to one or multiple quarters
- status_label is stored for future use only and does not affect calculations for now
- Plan is defined by brand and quarter
- The system uses a single currency: USD

## Working style
- Prioritize usability over visuals
- Do not invent business rules
- If something is unclear, ask before implementing

## Output style
- Be direct
- Keep code simple
- Avoid unnecessary abstractions

## Reading strategy
- ALWAYS read: CLAUDE.md
- Read forecast-resume.md ONLY IF the task involves business logic, data model, calculations, or import
- Read forecast-frontend.md ONLY IF the task is frontend
- Read /docs/* ONLY IF asked explicitly or if forecast-resume.md doesn't cover the detail needed
- Always prefer reading actual code files over documentation
- For backend tasks: read server.js first to understand structure
- For frontend tasks: read the relevant page/component directly

## After completing any task
- If you changed backend routes or endpoints: update the API section in forecast-resume.md
- If you changed business logic or data model: update the relevant section in forecast-resume.md
- If you changed frontend screens or behavior: update forecast-frontend.md
- If implementation state changed: update section 14 of forecast-resume.md
- Keep docs in sync with the code. Never leave them outdated.