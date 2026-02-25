# AGENTS.md — drift

## Qué es drift

`@eduardbar/drift` es un CLI TypeScript que escanea proyectos TypeScript con análisis AST (ts-morph) y asigna un score de 0 a 100 a cada archivo según la cantidad de deuda técnica AI-generada que contiene.

- **0** = código limpio
- **100** = reescribí esto antes de que alguien lo vea

Publicado en npm como `@eduardbar/drift`. MIT.

---

## Stack técnico

| Dep | Rol |
|-----|-----|
| `ts-morph ^27` | Motor AST — traversal de nodos TypeScript |
| `commander ^14` | CLI flags y subcomandos |
| `kleur ^4` | Colores en consola (sin dependencias) |
| `typescript ^5.9` | Dev — compilación |
| `@types/node ^25` | Dev — tipos Node.js |

**Runtime:** Node.js 18+, ES Modules (`"type": "module"`).

---

## Estructura del proyecto

```
drift/
├── bin/
│   └── drift.js          ← wrapper cross-platform (Windows npx fix)
├── src/
│   ├── types.ts          ← interfaces: DriftIssue, FileReport, DriftReport, AIOutput
│   ├── analyzer.ts       ← motor AST + 10 reglas de detección + drift-ignore
│   ├── reporter.ts       ← buildReport(), formatMarkdown(), formatAIOutput()
│   ├── printer.ts        ← salida consola con colores y score bar ASCII
│   ├── utils.ts          ← scoreToGrade, severityIcon, scoreBar
│   ├── index.ts          ← re-exports públicos (librería)
│   └── cli.ts            ← entry point Commander.js
├── assets/
│   ├── og.svg / og.png           ← imagen OG original
│   ├── og-v030-linkedin.svg/png  ← imagen post LinkedIn v0.3.0
│   └── og-v030-x.svg/png         ← imagen hilo X v0.3.0
├── dist/                 ← output tsc (no editar a mano)
├── .github/workflows/publish.yml
├── package.json
├── tsconfig.json
└── AGENTS.md             ← este archivo
```

---

## Comandos de desarrollo

```bash
npm run build       # tsc — compila src/ → dist/
npm run dev         # tsc --watch
npm start           # node dist/cli.js (desarrollo local)
```

**Pre-publicación:** `prepublishOnly` corre `build` automáticamente.

---

## CLI — flags disponibles

| Flag | Tipo | Descripción |
|------|------|-------------|
| `scan <path>` | positional | Ruta a escanear (requerido) |
| `--output <file>` / `-o` | string | Escribe reporte Markdown a archivo |
| `--json` | boolean | Imprime `DriftReport` crudo como JSON |
| `--ai` | boolean | JSON optimizado para LLMs (`AIOutput`) |
| `--fix` | boolean | Muestra sugerencias de fix en consola |
| `--min-score <n>` | number | Exit code 1 si score supera umbral (CI) |

**Uso básico:**
```bash
npx @eduardbar/drift scan .
npx @eduardbar/drift scan ./src --min-score 60
npx @eduardbar/drift scan ./src --ai | pbcopy   # pegar en Claude/GPT
npx @eduardbar/drift scan ./src --fix           # ver sugerencias inline
npx @eduardbar/drift scan ./src -o report.md    # exportar Markdown
```

---

## Reglas del analyzer

| Regla | Severidad | Peso |
|-------|-----------|------|
| `large-file` | error | 20 |
| `large-function` | error | 15 |
| `duplicate-function-name` | error | 18 |
| `high-complexity` | error | 15 |
| `circular-dependency` | error | 14 |
| `layer-violation` | error | 16 |
| `comment-contradiction` | warning | 12 |
| `deep-nesting` | warning | 12 |
| `semantic-duplication` | warning | 12 |
| `debug-leftover` | warning | 10 |
| `catch-swallow` | warning | 10 |
| `high-coupling` | warning | 10 |
| `dead-file` | warning | 10 |
| `hardcoded-config` | warning | 10 |
| `cross-boundary-import` | warning | 10 |
| `dead-code` | warning | 8 |
| `any-abuse` | warning | 8 |
| `too-many-params` | warning | 8 |
| `unused-export` | warning | 8 |
| `inconsistent-error-handling` | warning | 8 |
| `promise-style-mix` | warning | 7 |
| `unnecessary-abstraction` | warning | 7 |
| `naming-inconsistency` | warning | 6 |
| `unused-dependency` | warning | 6 |
| `no-return-type` | info | 5 |
| `over-commented` | info | 4 |
| `magic-number` | info | 3 |

**Score = suma de pesos capped a 100. Score del proyecto = promedio de archivos.**

---

## drift-ignore

**Por línea** (`// drift-ignore`):
- Suprime el issue en la línea actual o en la línea inmediatamente superior al problema.
- Funciona para cualquier regla.

**Por archivo** (`// drift-ignore-file`):
- Se coloca en las primeras 10 líneas del archivo.
- `analyzeFile()` devuelve reporte vacío (score 0, cero issues) para ese archivo.
- Usar en archivos con `console.log` intencional (ej: `printer.ts`).

---

## Formato `--ai` (`AIOutput`)

```typescript
interface AIOutput {
  summary: {
    score: number
    grade: string          // "CLEAN" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    total_issues: number
    files_affected: number
    files_clean: number
  }
  priority_order: Array<{
    rank: number
    file: string
    line: number
    rule: string
    severity: "error" | "warning" | "info"
    message: string
    snippet: string
    fix_suggestion: string
    effort: "low" | "medium" | "high"
  }>
  context_for_ai: {
    project_type: "typescript"
    scan_path: string
    rules_detected: string[]
    recommended_action: string
  }
}
```

Los issues se ordenan: error > warning > info, luego low effort primero (quick wins).

---

## Formato `--fix` en consola

```
       ┌──────────────────────────────────────────────────────┐
       │  - console.log(userData)
       │  + Remove this console.log statement
       │  + Or replace with a proper logging library
       └──────────────────────────────────────────────────────┘
```

Las sugerencias por regla están hardcodeadas en `src/printer.ts`.

---

## CI/CD — GitHub Actions

Workflow en `.github/workflows/publish.yml`:
- **Trigger único:** `release: published` (evita doble publish)
- **Fallback manual:** `workflow_dispatch` con input `tag`
- **Guard:** verifica `npm view @eduardbar/drift@$VERSION` antes de publicar

**Integración CI en proyectos externos:**
```yaml
- name: Check drift score
  run: npx @eduardbar/drift scan ./src --min-score 60
```

---

## Compatibilidad Windows

`bin/drift.js` es el wrapper cross-platform:
```javascript
#!/usr/bin/env node
import('../dist/cli.js')
```

`package.json` apunta `bin.drift` a `bin/drift.js`, **no** a `dist/cli.js`.
Sin esto, Windows no ejecuta el shebang correctamente con ES modules.

---

## Versiones

| Versión | Cambios principales |
|---------|---------------------|
| **1.0.0** | 26 reglas, 131 tests, modular rules, JS/JSX, drift fix/report/diff/ci/badge/trend/blame, VS Code extension |
| **0.3.0** | `--ai` (LLM-optimized JSON output) + `--fix` (inline suggestions) |
| **0.2.3** | Fix: bin wrapper para compatibilidad Windows npx |
| **0.2.2** | Refactor: `formatMarkdown` dividido en helpers + fix CI doble publish |
| **0.2.1** | `drift-ignore` por línea y por archivo + fix console output propio |
| **0.2.0** | Score bar ASCII + header hierarchy + DRY utils + file count en CLI |
| **0.1.x** | Bootstrap: tipos, analyzer (10 reglas), reporter, printer, CLI, CI/CD |

---

## Convenciones de código

- Todo en TypeScript — sin `any` explícito (drift se corre sobre sí mismo)
- ES Modules — `import/export`, sin CommonJS
- Conventional Commits obligatorios (ver AGENTS.md global)
- `// drift-ignore-file` en `printer.ts` — sus `console.log` son output intencional
- `scoreToGrade`, `severityIcon`, `scoreBar` viven en `utils.ts` — no duplicar
- Nuevas reglas: agregar entrada en `RULE_WEIGHTS` en `analyzer.ts` + lógica de detección AST

---

## Agregar una nueva regla — checklist

1. Agregar `"rule-name": <peso>` a `RULE_WEIGHTS` en `src/analyzer.ts`
2. Implementar la lógica de detección AST usando ts-morph en `analyzeFile()`
3. Agregar `fix_suggestion` para la regla en `src/printer.ts` (objeto de sugerencias por regla)
4. Actualizar `README.md` — tabla de reglas
5. Actualizar este `AGENTS.md` — tabla de reglas
6. Commit: `feat(analyzer): add <rule-name> rule`
