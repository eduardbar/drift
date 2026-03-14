# AGENTS - Guia Operativa para drift

## 1) Proposito

Esta guia define como colaborar en `drift` para mantener calidad tecnica, consistencia de arquitectura y foco en producto.

`drift` existe para detectar deuda tecnica asociada a codigo IA en proyectos TypeScript y convertir esa senial en acciones concretas.

## 2) Stack y estructura principal

### Stack real

- Runtime: Node.js 18+
- Lenguaje: TypeScript (`type: module`)
- Analisis AST: `ts-morph`
- CLI: `commander`
- Output en consola: `kleur`
- Testing: `vitest`

### Estructura clave

- `src/analyzer.ts`: motor principal de reglas y score
- `src/rules/*`: reglas por fases y helpers de deteccion
- `src/reporter.ts`: armado de reporte y salidas para markdown/AI
- `src/printer.ts`: salida CLI y sugerencias de fix
- `src/cli.ts`: entrypoint y subcomandos
- `src/fix.ts`, `src/report.ts`, `src/ci.ts`, `src/diff.ts`: comandos operativos
- `packages/eslint-plugin-drift`: plugin ESLint
- `packages/vscode-drift`: extension VSCode

## 3) Comandos de desarrollo

Usar los comandos del repo (fuente: `package.json`):

```bash
npm run build
npm run dev
npm start
npm test
npm run test:watch
npm run test:coverage
```

Comandos de uso de producto (referencia):

```bash
npx @eduardbar/drift scan ./src
npx @eduardbar/drift scan ./src --ai
npx @eduardbar/drift scan ./src --min-score 60
```

## 4) Reglas de contribucion

- Mantener cambios pequenos, enfocados y trazables.
- No editar `dist/` manualmente.
- No introducir `any` sin justificacion tecnica fuerte.
- Reusar utilidades existentes (`utils.ts`) antes de duplicar logica.
- Si agregas una regla nueva, actualizar:
  - peso en `RULE_WEIGHTS`
  - deteccion AST
  - sugerencia de fix
  - documentacion (README/AGENTS/PRD segun aplique)

## 5) Convencion de commits

Se usa Conventional Commits.

Formato:

```text
type(scope): descripcion corta
```

Tipos recomendados:

- `feat`: nueva capacidad de producto
- `fix`: correccion de bug
- `refactor`: cambio interno sin impacto funcional
- `test`: mejoras o nuevos tests
- `docs`: documentacion
- `chore`: mantenimiento

Ejemplos:

- `feat(review): add PR score and markdown output`
- `fix(analyzer): prevent false positive in dead-file rule`
- `docs(prd): define v1.2 architecture roadmap`

## 6) Flujo para proponer e implementar features del PRD

### Paso 1 - Definir alcance MVP

- Explicar objetivo de negocio y usuario.
- Delimitar que entra y que queda fuera.
- Agregar criterios de aceptacion verificables.

### Paso 2 - Disenar impacto tecnico

- Identificar comandos, modulos y reglas afectados.
- Definir formato de salida (CLI/JSON/AI).
- Evaluar costo de performance en repos grandes.

### Paso 3 - Implementar por incrementos

- Primero contrato de tipos y salida.
- Luego deteccion/reglas/comandos.
- Finalmente UX de consola y documentacion.

### Paso 4 - Validar

- Tests unitarios de logica nueva.
- Tests de integracion de CLI cuando aplique.
- Verificacion manual de casos reales.

## 7) Criterios minimos de calidad y testing

Antes de merge, cada cambio debe cumplir:

- Tests pasando (`npm test`).
- Cobertura razonable en paths nuevos (`npm run test:coverage` cuando aplique).
- Sin regresiones en salida JSON/AI (contratos estables).
- Errores y mensajes de CLI claros y accionables.
- Performance aceptable para el alcance del cambio.

## 8) Seguridad y manejo de informacion

- Nunca commitear secretos (`.env`, tokens, credenciales, llaves).
- No incluir datos sensibles en fixtures ni snapshots.
- Si una feature requiere integracion externa, usar variables de entorno y documentar setup sin exponer valores.
- Mantener principio de minimo privilegio en scripts y flujos CI.

## 9) Criterios de aceptacion para features nuevas

Una feature se considera lista cuando:

- Resuelve un objetivo explicitado en `docs/PRD.md`.
- Tiene MVP funcional y criterios de aceptacion cumplidos.
- Incluye tests y documentacion operativa.
- Es compatible con flujo CLI existente y CI.

## 10) Practicas recomendadas para agentes/colaboradores

- Priorizar cambios que mejoren senial sobre ruido.
- Favorecer reportes accionables por sobre analisis abstracto.
- Evitar humo en roadmap: cada entrega debe mapear a comando, salida y test.
- Dejar decisiones registradas en la documentacion del repo.
