# PRD - drift

Version: 1.1-draft  
Estado: Draft  
Producto: `@eduardbar/drift`

## 1) Contexto

`drift` es un CLI de analisis estatico para TypeScript que detecta deuda tecnica asociada a codigo generado por IA y calcula un score de calidad por archivo y por repositorio.

Hoy el producto ya cubre escaneo AST, score, reportes y comandos operativos (`scan`, `fix`, `report`, `ci`, `diff`, `badge`, `snapshot`, `trend`, `blame`).

Este PRD define la evolucion para convertir a drift en una plataforma de calidad de codigo AI-first, con foco en revision de PRs, reglas de arquitectura y accionabilidad.

## 2) Vision de Producto

Ser la herramienta de referencia para equipos que usan IA para programar y necesitan detectar, priorizar y corregir deuda tecnica antes de que llegue a produccion.

## 3) Killer Feature

## AI Code Smell Detector

El diferencial principal de drift es detectar patrones de olor tecnico vinculados a codigo IA, estimar probabilidad de origen IA y traducir hallazgos en acciones concretas (fixes, comentarios de PR, reglas de arquitectura y reportes).

## 4) Objetivos de Negocio y Producto

- Reducir riesgo de mantenimiento en repos con alto volumen de codigo IA.
- Dar feedback accionable en el punto de trabajo (CLI, PR y editor).
- Estandarizar calidad arquitectonica con reglas configurables por equipo.
- Escalar desde CLI local a experiencia organizacional (dashboard SaaS).

## 5) Alcance MVP por Feature (sin humo)

Cada feature incluye objetivo, alcance MVP y criterios de aceptacion.

### 5.1 Detector de codigo generado por IA

- Objetivo: estimar `ai_likelihood` por archivo y listar `files_suspected`.
- Alcance MVP:
  - Exponer `ai_likelihood` (0-100) dentro de salida JSON/AI.
  - Agregar lista ordenada de archivos sospechados con score y reglas disparadas.
  - No hacer afirmaciones absolutas; reportar como probabilidad.
- Criterios de aceptacion:
  - `drift scan <path> --ai` incluye `ai_likelihood` por archivo.
  - Reporte global incluye `files_suspected` y top N archivos.
  - Tests cubren serializacion y orden de prioridad.

### 5.2 PR reviewer automatico (`drift review` + comentario en PR)

- Objetivo: revisar cambios de PR y publicar feedback tecnico automatico.
- Alcance MVP:
  - Nuevo comando `drift review` para analizar diff contra base branch.
  - Salida markdown apta para comentario de PR.
  - Integracion base via GitHub CLI (`gh`) en CI.
- Criterios de aceptacion:
  - `drift review --base main` devuelve score de PR y top issues.
  - En workflow CI se publica un comentario unico actualizable.
  - Si score supera umbral configurable, CI falla.

### 5.3 Reglas de arquitectura configurables

- Objetivo: habilitar reglas de arquitectura de negocio definidas por el equipo.
- Alcance MVP:
  - Soporte en `drift.config.ts` para:
    - `controller-no-db`
    - `service-no-http`
    - `max-function-lines`
  - Mensajes de error claros con ubicacion y recomendacion.
- Criterios de aceptacion:
  - Config valida y tipada.
  - Reglas activas afectan score y aparecen en reporte.
  - Fixtures de test para casos validos e invalidos.

### 5.4 Score de calidad por repo con breakdown

- Objetivo: mostrar salud del repo en forma ejecutiva y tecnica.
- Alcance MVP:
  - Score global del repo.
  - Breakdown por severidad, regla y carpeta.
  - Tendencia minima (ultimos snapshots locales).
- Criterios de aceptacion:
  - `drift scan` muestra score repo + breakdown resumido.
  - `--json` expone estructura consumible por CI/dashboard.

### 5.5 Mapa de arquitectura automatico (`drift map` -> `architecture.svg`)

- Objetivo: visualizar dependencias y violaciones de capas.
- Alcance MVP:
  - Nuevo comando `drift map`.
  - Genera `architecture.svg` desde imports y modulos detectados.
  - Marca ciclos y violaciones de capas.
- Criterios de aceptacion:
  - `drift map ./src` crea `architecture.svg` sin edicion manual.
  - El SVG es legible en repos medianos (ej. <= 300 archivos TS).

### 5.6 VSCode extension con feedback en tiempo real

- Objetivo: bajar el tiempo entre error y correccion.
- Alcance MVP:
  - Diagnosticos por archivo al guardar.
  - Score visible por archivo.
  - Quick actions para sugerencias simples.
- Criterios de aceptacion:
  - La extension muestra issues drift en panel Problems.
  - La latencia por archivo en save se mantiene en nivel usable.

### 5.7 Fix automatico (`drift fix`) con ejemplo antes/despues

- Objetivo: convertir hallazgos en cambios concretos de bajo riesgo.
- Alcance MVP:
  - `drift fix` aplica fixes seguros en reglas seleccionadas.
  - Modo preview con diff antes/despues.
  - Modo write con confirmacion.
- Criterios de aceptacion:
  - `drift fix --preview` imprime diff legible.
  - `drift fix --write` modifica solo reglas soportadas.
  - Tests de no-regresion para no romper sintaxis TS.

Ejemplo (antes/despues):

```ts
// Antes
console.log(userData)

// Despues (sugerencia simple)
// Removed debug leftover; use structured logger if needed.
```

### 5.8 Reporte tecnico (`drift report` -> `drift-report.html`)

- Objetivo: entregar reporte compartible para devs, tech leads y QA.
- Alcance MVP:
  - Salida HTML `drift-report.html` con score, breakdown y top issues.
  - Secciones por archivo con snippets y sugerencias.
- Criterios de aceptacion:
  - `drift report ./src --html` genera archivo navegable.
  - El reporte puede adjuntarse en CI artifacts.

### 5.9 Metricas de riesgo de mantenimiento (hotspots)

- Objetivo: priorizar deuda por impacto real.
- Alcance MVP:
  - Hotspots combinando score + frecuencia de cambios + criticidad.
  - Ranking de archivos para plan de refactor.
- Criterios de aceptacion:
  - `drift trend` o salida dedicada muestra top hotspots.
  - Metodo de ranking documentado y testeado.

### 5.10 Plugin system (`drift-plugin-*`)

- Objetivo: extender drift sin tocar el core.
- Alcance MVP:
  - Carga de plugins por convension `drift-plugin-*`.
  - API minima para registrar reglas y metadata.
  - Aislamiento de errores de plugins para no romper scan completo.
- Criterios de aceptacion:
  - Plugin de ejemplo funcional en repo de ejemplo.
  - Si un plugin falla, drift sigue ejecutando y reporta el error.

## 6) Roadmap Realista

### v1.1

- `drift review` para PR comments.
- Score de PR y score de repo con breakdown minimo.

### v1.2

- Reglas de arquitectura configurables.
- `drift map` y generacion de `architecture.svg`.

### v2

- VSCode extension con feedback en tiempo real.
- `drift fix` con preview/write y fixes seguros.

### v3

- SaaS dashboard para historico, equipos y gobierno de calidad.

## 7) Fuera de Alcance (por ahora)

- Soporte multi-lenguaje completo fuera de TypeScript/JS.
- Autofix de reglas de alto riesgo sin confirmacion.
- Integraciones propietarias cerradas sin API estable.

## 8) KPIs de Exito

- Reduccion de score promedio en repos activos.
- % de PRs con feedback drift resuelto antes de merge.
- Tiempo medio desde deteccion hasta fix aplicado.
- Adopcion de reglas de arquitectura por equipo.

## 9) Dependencias y Riesgos

- Performance en repos grandes (AST + analisis cross-file).
- Calidad de senial en `ai_likelihood` (riesgo de falsos positivos).
- Compatibilidad de integraciones CI/PR entre plataformas.
- Diseno de API de plugins sin romper backward compatibility.

## 10) Definicion de Done (global)

Una feature del roadmap se considera terminada cuando:

- Tiene comando/flujo usable y documentado.
- Tiene tests automatizados de casos base y borde.
- Tiene salida estable en CLI/JSON para CI.
- Tiene criterios de aceptacion de esta PRD cumplidos.
