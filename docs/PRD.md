# PRD - drift

Version: 1.1.0  
Estado: Activo  
Producto: `@eduardbar/drift`

## 1) Contexto

`drift` es un CLI de analisis estatico para TypeScript que detecta deuda tecnica asociada a codigo generado por IA y calcula score por archivo y por repositorio.

Con release `v1.1.0`, el producto ya entrega comandos operativos, analisis AST, reglas de arquitectura configurables, salida accionable y flujo de fixes/reportes para uso local y CI.

## 2) Vision de producto

Ser la herramienta de referencia para equipos que usan IA para programar y necesitan detectar, priorizar y corregir deuda tecnica antes de mergear a produccion.

## 3) Killer feature

## AI Code Smell Detector

Detectar patrones de olor tecnico vinculados a codigo IA, estimar probabilidad de origen IA y traducir hallazgos en acciones concretas (fixes, review de PR, reglas de arquitectura y reportes).

## 4) Estado de cumplimiento (actualizado)

### Entregado

- `drift review` en CLI para analizar diff contra base y producir markdown usable en PR.
- `drift map` basico para generar `architecture.svg`.
- Senial de IA en salida (`ai_likelihood` y `files_suspected`).
- Reglas de arquitectura configurables via `drift.config.ts`.
- Score y breakdown por dimensiones para lectura ejecutiva y tecnica.
- Metricas de maintenance risk/hotspots.
- Plugin system MVP (`drift-plugin-*`) con aislamiento de errores.
- `drift fix` con modos preview/write.
- Workflow CI para comentario automatico unico y actualizable de `drift review`.
- `drift map` con marcado de cycle edges y layer violations en el SVG.
- VSCode quick actions para fixes de bajo riesgo.
- Confirmacion interactiva para `drift fix --write` (con `--yes` para CI/no-interactive).
- `drift report` HTML (`drift-report.html`) sin flag extra.
- Documentacion y tests del release.

### Parcial

- Consolidacion/hardening de API de plugins para ecosistema externo amplio.

### Pendiente

- Dashboard SaaS (historico, equipos, gobierno y visibilidad organizacional).

## 5) Criterios de aceptacion vigentes

### 5.1 Entregables cerrados en v1.1.0

- `drift review --base <ref>` devuelve score delta de PR, issues nuevos/resueltos y markdown.
- `drift scan --ai` incluye `ai_likelihood` y ranking `files_suspected`.
- `drift map <path>` genera `architecture.svg` utilizable sin edicion manual.
- `drift report [path]` genera HTML self-contained (no requiere `--html`).
- `drift fix --preview` muestra antes/despues y `drift fix --write` aplica reglas soportadas.

### 5.1.b Entregables cerrados en v1.2 (scope tecnico)

- Workflow CI publica/actualiza comentario unico en PR para `drift review`.
- `drift map` marca visualmente ciclos y violaciones por capa.
- Extension VSCode expone quick actions para `debug-leftover` y `catch-swallow`.
- `drift fix --write` pide confirmacion interactiva por defecto y admite `--yes`.

### 5.2 Objetivos aun abiertos (CI/editor/UX)

- Hardening del contrato de plugins para compatibilidad de largo plazo (versionado/migraciones).

## 6) Roadmap actualizado

### v1.1 (completado - release 1.1.0)

Prioridades cerradas:
- CLI de review para PR, mapa basico, salida AI, reglas configurables, report HTML, fix preview/write, hotspots, plugin MVP.

Done del bloque:
- Features documentadas.
- Tests de paths principales.
- Salidas CLI/JSON/AI consistentes para uso local y CI.

### v1.2 (completado - cierre de pendientes tecnicos)

Prioridades cerradas:
- Comentario automatico actualizable en PR desde workflow CI.
- Mejora de `drift map` para destacar ciclos y violaciones.
- UX de seguridad para `drift fix --write` con confirmacion interactiva.

Done del bloque:
- Flujo CI reproducible con comentario unico por PR.
- Visualizaciones verificables en SVG sobre repos medianos.
- Confirmacion interactiva implementada para write mode.

### v2 (prioridad: experiencia de editor + extensibilidad)

Prioridades:
- Consolidacion de API de plugins y hardening de compatibilidad.
- Reglas de plugin versionadas y validacion de contrato avanzada.

Criterio de done:
- Plugins con contrato estable y manejo de errores robusto.
- Documentacion de versionado para autores de plugins.

### v3 (prioridad: capa organizacional)

Prioridad:
- Dashboard SaaS.

Criterio de done:
- Historico multi-repo, vistas por equipo y gobierno de calidad con autenticacion basica.

## 6.1) Estrategia de monetizacion (aprobada)

- Fase gratuita: Drift SaaS gratis hasta alcanzar 7.500 usuarios registrados.
- Trigger de monetizacion: al alcanzar 7.500 usuarios, activar planes pagos para nuevos usuarios y definir politica de migracion para cohortes gratuitas.
- Objetivo: priorizar adopcion y proof-of-value temprano sin friccion comercial inicial.
- Guardrails durante fase gratuita:
  - Limites tecnicos por workspace (runs/mes, retencion de historial, repositorios activos).
  - Instrumentacion de uso desde el dia 1 para evitar abuso y medir unit economics.
  - Feature flags de pricing listas antes del trigger para evitar corte abrupto.

## 7) Fuera de alcance actual

- Soporte multi-lenguaje completo fuera de TypeScript/JS.
- Autofix de reglas de alto riesgo sin confirmacion explicita.
- Integraciones propietarias cerradas sin API estable.

## 8) KPIs de exito

- Reduccion de score promedio en repos activos.
- % de PRs con feedback drift resuelto antes de merge.
- Tiempo medio desde deteccion hasta fix aplicado.
- Adopcion de reglas de arquitectura configurables por equipo.

## 9) Dependencias y riesgos

- Performance en repos grandes (AST + cross-file).
- Calidad de senial en `ai_likelihood` (falsos positivos/negativos).
- Variabilidad de entornos CI para publicar comentarios de PR.
- Evolucion de API de plugins sin romper backward compatibility.

## 10) Definition of Done por release

Checklist minimo por release:

- [ ] Scope del release cerrado y trazable a este PRD.
- [ ] Comandos/flujo documentados con ejemplos reales.
- [ ] Tests de regresion en paths principales y casos borde.
- [ ] Salidas CLI/JSON/AI estables para automatizacion.
- [ ] Criterios de aceptacion del bloque marcados como cumplidos o movidos a pendiente.
- [ ] Riesgos y tradeoffs explicitados en notas de release.
