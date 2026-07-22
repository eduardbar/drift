# AGENTS.md — drift

## Qué es drift

`@eduardbar/drift` es un CLI de auditoría estática para repos TypeScript/JavaScript orientado a deuda estructural y confianza de merge en PRs asistidas por AI.

- Publicado en npm como `@eduardbar/drift`
- Licencia MIT
- Versión del paquete: `1.6.0` (`package.json`)

---

## Stack y runtime

| Dep | Rol |
|-----|-----|
| `ts-morph ^27` | análisis AST |
| `commander ^14` | CLI y flags |
| `kleur ^4` | salida con color |
| `typescript ^5.9` | compilación |
| `vitest ^4` | testing |

Runtime: Node.js 20.x and 22.x (LTS), ES Modules (`"type": "module"`).

---

## Comandos CLI actuales

Comandos top-level definidos en `src/cli.ts`:

- `scan [path]`
- `init`
- `context [path]`
- `mcp [path]`
- `ai-guard [path]`
- `diff [ref]`
- `guard [path]`
- `benchmark`
- `review`
- `trust [path]`
- `trust-gate <trustJsonFile>`
- `doctor`
- `kpi <path>`
- `map [path]`
- `report [path]`
- `badge [path]`
- `ci [path]`
- `trend [period]`
- `blame [target]`
- `fix [path]`
- `snapshot [path]`
- `cloud` (con subcomandos: `ingest`, `summary`, `plan-set`, `plan-changes`, `usage`, `dashboard`)

---

## Reglas y scoring (estado real)

- La fuente de verdad de reglas/pesos/severidad es `RULE_WEIGHTS` en `src/analyzer.ts`.
- Estado actual: **35 rule IDs** (incluye reglas de detección, reglas configurables, meta-reglas y diagnósticos de plugins/guardrails de análisis).
- Score por archivo: suma de pesos cap a 100.
- Score de proyecto: promedio de scores por archivo.

Catálogo completo actualizado en `docs/rules-catalog.md`.

---

## Configuración soportada (`drift.config.*`)

`DriftConfig` actual (ver `src/types/app.ts`):

- `layers`: capas para `layer-violation`
- `modules`: boundaries para `cross-boundary-import`
- `moduleBoundaries` / `boundaries`: alias legacy normalizados a `modules`
- `plugins`: plugins drift
- `performance`: `lowMemory`, `chunkSize`, `maxFiles`, `maxFileSizeKb`, `includeSemanticDuplication`
- `architectureRules`: `controllerNoDb`, `serviceNoHttp`, `maxFunctionLines`
- `saas`: límites/política local multi-tenant (`strictActorEnforcement` incluido)
- `trustGate`: políticas de gating para `trust` / `trust-gate`
- `aiIntegration`: opciones locales para el contexto y el servidor MCP
- `aiGuard`: presupuesto y reglas de bloqueo para `ai-guard`

Notas:

- Sin config, reglas puramente configurables/arquitectónicas se omiten.
- `exclude` y overrides tipo `rules: { ... }` **no** forman parte del contrato tipado actual de `DriftConfig`.

---

## Flags transversales de recursos

`scan`, `diff`, `guard`, `trust`, `report`, `badge`, `ci`, `snapshot` comparten:

- `--low-memory`
- `--chunk-size <n>`
- `--max-files <n>`
- `--max-file-size-kb <n>`
- `--with-semantic-duplication`

---

## Comandos incorporados recientes (operativos)

- `init`: scaffolding de `drift.config.ts`, workflow CI y baseline (`drift-baseline.json`)
- `doctor`: diagnóstico de entorno/proyecto (`--json` opcional)
- `guard`: evaluación de regresión por diff (`--base`) o baseline (`--baseline`) con `--budget` y `--by-severity`
- `context`: documento local `.drift/context.md` y comprobación de frescura con `--ci`
- `mcp`: servidor MCP local por stdio; `--inspect` expone exactamente seis herramientas sin iniciar el servidor
- `ai-guard`: análisis aislado de diffs con códigos `0` (pass), `1` (policy block) y `2` (input/error)

---

## Convenciones de contribución (rápidas)

- Evitar drift real en el propio repo (drift se corre sobre sí mismo).
- Mantener README + AGENTS + catálogo de reglas sincronizados cuando cambian reglas/CLI.
- Usar Conventional Commits.

---

## Archivos clave

- `src/cli.ts` — contrato de comandos y flags
- `src/context.ts` — generación y frescura de `.drift/context.md`
- `src/mcp-server.ts` — servidor MCP local stdio y sus seis herramientas
- `src/ai-guard.ts` — orquestación del guard de diffs
- `src/ai-guard-guardian.ts` / `src/cleanup-guardian.ts` — aislamiento y limpieza del workspace temporal
- `src/analyzer.ts` — orquestación de análisis + `RULE_WEIGHTS`
- `src/rules/*.ts` — detecciones por fase
- `src/config.ts` y `src/types/*.ts` — contrato de configuración
- `README.md` — documentación de uso pública
- `docs/rules-catalog.md` — inventario completo de reglas
