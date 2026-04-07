5. Orden correcto

Hacelo en este orden:

Paso 1

Creá la carpeta nueva de la v2.

Paso 2

Creá los archivos .md y pegá lo que te dejé.

Paso 3

Instalá los plugins.

Paso 4

Abrí Claude Code sobre esa carpeta.

Paso 5

Corré primero el prompt del business-analyst.

Paso 6

Ajustá los docs si aparece algo ambiguo.

Paso 7

Corré el ui-designer.

Paso 8

Con eso cerrado, corré backend-developer.

Paso 9

Después frontend-developer.

Paso 10

Al final code-reviewer.

6. Regla clave para no quemar tokens

No mezcles todo junto.

Mal:

varios agentes a la vez
prompts con 8 tareas
contexto desordenado

Bien:

1 agente
1 tarea
docs cortos y claros
salida esperada concreta
7. Mi recomendación práctica para vos

Yo haría esto mañana mismo:

creás la carpeta forecast-v2
copiás los docs del canvas
instalás los plugins
arrancás con business-analyst
me pegás lo que te devuelve
lo refinamos juntos antes de pasar al siguiente

Si querés, el próximo mensaje te lo hago todavía más directo: comandos exactos desde cero para crear la carpeta y los archivos en Mac.



PROMPTSS AGENTES

@ui-designer

Read:
- CLAUDE.md
- docs/SPEC.md
- docs/SCREENS.md
- docs/RULES.md

Context:
Internal tool, daily use.
UX > visuals.
Transactions screen is critical.

Task:
Design the app structure.

For each screen:
- purpose
- sections
- key actions
- table fields

Also:
- navigation structure
- UX principles

Do NOT generate code.
Keep it simple and practical.



@backend-developer

Read:
- CLAUDE.md
- docs/SPEC.md
- docs/DATA_MODEL.md
- docs/RULES.md

Task:
Build backend foundation.

Include:
1. SQLite schema
2. DB init
3. transactions CRUD
4. plans CRUD
5. summary endpoints

Rules:
- no stage_percent stored
- derive all calculated values
- exclude Cancelado
- keep it simple

Output:
1. file structure
2. implementation step by step


@frontend-developer

Read:
- CLAUDE.md
- docs/SPEC.md
- docs/SCREENS.md
- docs/RULES.md

Task:
Build frontend base.

Screens:
- Overview
- Transactions
- Plans

Requirements:
- clear navigation
- clean UI
- strong tables
- fast forms

Show:
- weighted values clearly

Output:
1. file structure
2. components implementation