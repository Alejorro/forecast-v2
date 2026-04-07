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