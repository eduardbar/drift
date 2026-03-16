# PRD - drift

> **AI Code Audit CLI para recuperar confianza de merge en PRs asistidos por IA.**

**Version del PRD**: 1.3.0-scope-refresh  
**Version de producto vigente**: 1.2.0  
**Estado**: Activo  
**Producto**: `@eduardbar/drift`  
**Owner**: Eduardo Barba  
**Fecha**: 2026-03-15

---

## 1. Contexto y problema

El uso de IA para programar acelera entregas, pero tambien aumenta ruido tecnico en Pull Requests: cambios grandes, deuda encubierta, reglas de arquitectura rotas y riesgo de merge dificil de evaluar rapido.

Hoy muchos equipos hacen review "a ojo" o dependen de checks incompletos. Resultado: se mergea codigo con riesgo real porque falta una senial consolidada y accionable para decidir si un PR esta listo.

Drift se reposiciona para cerrar ese gap: pasar de "scanner de deuda" a "decision engine de confianza de merge" para repos TypeScript/JavaScript con flujo local y CI.

---

## 2. Reposicionamiento de producto

### 2.1 Nueva tesis

`drift` es un **AI Code Audit CLI** orientado a responder una pregunta critica antes de mergear:

**"Este PR asistido por IA es confiable para merge?"**

### 2.2 North Star de posicionamiento

Mover el foco de "contar smells" a "reducir riesgo de merge" con una salida resumida, priorizada y utilizable por developers, reviewers y tech leads.

---

## 3. Que NO es y que SI es Drift

| Categoria | Definicion |
|---|---|
| No es | Un code generator ni un copiloto para escribir features |
| No es | Un SaaS dependiente de backend propio para funcionar |
| No es | Un reemplazo completo de code review humano |
| No es | Un quality gate magico multi-lenguaje full stack |
| Si es | Un CLI local/CI de auditoria tecnica para codigo TypeScript/JavaScript |
| Si es | Un sistema de scoring y priorizacion de deuda con foco en riesgo de merge |
| Si es | Una herramienta para PRs asistidos por IA con salida accionable |
| Si es | Un producto operable sin infraestructura propietaria (user-run) |

---

## 4. Estado real del producto (v1.2.0)

### 4.1 Capacidades entregadas y activas

| Area | Estado | Capacidades vigentes |
|---|---|---|
| Analisis AST y scoring | Entregado | Reglas de drift, score por archivo/repositorio, salida CLI/JSON/AI |
| PR review | Entregado | `drift review` con diff vs base, markdown para PR, delta de issues |
| Arquitectura | Entregado | `drift map` con `architecture.svg`, cycle edges, layer violations |
| Fixes | Entregado | `drift fix --preview` y `drift fix --write` con confirmacion (`--yes` para CI) |
| Reporteria | Entregado | `drift report` HTML self-contained |
| CI | Entregado | Workflow para comentario unico y actualizable en PR |
| Editor | Entregado | VSCode quick actions para fixes de bajo riesgo |
| Extensibilidad | MVP entregado | Plugin system `drift-plugin-*` con aislamiento de errores |
| Foundations cloud-like | Entregado (base) | `drift cloud ingest|summary|dashboard`, politica free-until-7500 en PRD |

### 4.2 Abiertos actuales

- Hardening del contrato de plugins para ecosistema externo de largo plazo.
- Evolucion de foundations cloud-like hacia experiencia multi-tenant completa (auth, roles, billing) cuando corresponda.

Nota: este PRD no declara como implementado nada fuera de las capacidades ya reflejadas en v1.2.0.

---

## 5. Feature estrella: `drift trust`

### 5.1 Objetivo

Introducir `drift trust` como salida de alto nivel para decision de merge en PRs asistidos por IA.

### 5.2 Output conceptual esperado

`drift trust` debe sintetizar en un bloque corto y accionable:

| Campo | Proposito |
|---|---|
| Trust Score | Puntaje de confianza de merge (0-100) |
| Merge Risk | Clasificacion de riesgo (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) |
| Top Reasons | Principales razones que explican el riesgo |
| Fix Priorities | Orden recomendado de correcciones para bajar riesgo rapido |

### 5.3 Alcance funcional del feature

- Usa seniales ya existentes en Drift (reglas, severidad, diff, arquitectura, hotspots) para componer una conclusion ejecutiva.
- Prioriza interpretabilidad: cada resultado debe explicar por que sube/baja la confianza.
- Se diseña para uso local y CI sin requerir servicio central.

Importante: en este documento, `drift trust` se define como **scope de producto**; su implementacion tecnica se planifica por etapas.

---

## 6. Scope de producto: Core vs Premium

### 6.1 Drift Core (base abierta y utilizable)

| Incluido en Core | Notas |
|---|---|
| `scan`, `review`, `fix`, `report`, `map`, `ci`, `diff`, `snapshot`, `trend`, `blame` | Mantiene propuesta actual de CLI tecnico |
| Reglas de drift y score base | Incluye salida JSON/AI para automatizacion |
| `drift trust` baseline | Trust Score + Merge Risk + Top Reasons + Fix Priorities en modo esencial |
| Uso local + CI en runners del usuario | Sin infraestructura Drift obligatoria |

### 6.2 Drift Premium (valor para equipos)

| Incluido en Premium | Propuesta de valor |
|---|---|
| `drift trust` avanzado | Mayor contexto historico, comparativas y guidance de remediacion de equipo |
| Policy packs y controles por equipo | Gates y criterios de merge mas finos |
| Reportes ejecutivos extendidos | Vistas para liderazgo tecnico y seguimiento de riesgo |
| Soporte y prioridad | Respuesta mas rapida y acompanamiento de adopcion |

Nota: Premium define direccion comercial; la activacion concreta depende del roadmap de producto y capacidad operativa.

---

## 7. Pricing inicial y propuesta comercial

### 7.1 Planes

| Plan | Precio | Publico objetivo | Valor principal |
|---|---:|---|---|
| Free | USD 0 (forever) | Developers individuales + open source | Analisis local ilimitado, output accionable y adopcion sin friccion |
| Sponsor | USD 8/mes o USD 80/anio | Fans, freelancers y power users | Apoyo al proyecto + rule packs premium ligeros + early access |
| Team | USD 39/mes por org o USD 390/anio | Equipos pequenos/medianos | Gobernanza inicial: policies, thresholds por branch y suppressions por regla |
| Business | USD 149/mes por org o USD 1490/anio | Equipos con mayor exigencia | Governance/compliance avanzado, custom rules y soporte prioritario |

### 7.2 Hipotesis de monetizacion

- Inicio con **GitHub Sponsors** como canal principal de conversion (Sponsor plan).
- Validar willingness-to-pay antes de escalar complejidad comercial.
- Evolucionar hacia Team/Business conforme se consolide `drift trust` y demanda de gobierno por equipo.

---

## 8. Estrategia operativa (sin infraestructura propia)

### 8.1 Principios

- Drift corre donde ya corre el codigo: laptop del developer, CI existente, runners del usuario.
- No se requiere backend propietario para la propuesta principal de valor.
- Costos operativos iniciales bajos para maximizar foco en producto y distribucion.

### 8.2 Modelo operativo

| Dimension | Decision |
|---|---|
| Compute | Local/CI del usuario |
| Storage | Artefactos y reportes en entorno del usuario |
| Integracion | CLI + GitHub Actions + outputs markdown/JSON/AI |
| Monetizacion inicial | GitHub Sponsors + futura oferta Team/Business |

---

## 9. Launch strategy por etapas

### Etapa 1 - Reposicionamiento y mensaje (inmediato)

- Actualizar narrativa publica: de "deuda tecnica IA" a "merge trust para PRs asistidos por IA".
- Publicar docs y ejemplos orientados a decision de merge.
- CTA principal: probar `drift review` y futura experiencia `drift trust`.

### Etapa 2 - `drift trust` baseline (producto)

- Entregar salida conceptual en CLI/CI con Trust Score, Merge Risk, Top Reasons, Fix Priorities.
- Incorporar senales de diff/PR de forma deterministica (`--base`) y salida markdown lista para comentarios de PR.
- Medir adopcion en PR workflows y feedback de interpretabilidad.
- Ajustar pesos/heuristicas con evidencia de uso real.

### Etapa 3 - Conversion y expansion

- Activar perks para Sponsor y clarificar diferencia Core vs Premium.
- Formalizar Team plan con policies y reportes de riesgo compartidos.
- Preparar oferta Business para cuentas con necesidad de governance.

---

## 10. Positioning copy (taglines y one-liners)

### 10.1 Taglines

- "Merge con confianza, incluso cuando el PR vino asistido por IA."
- "Tu AI Code Audit CLI para decidir merge sin adivinar."
- "Menos ruido de PR, mas confianza de release."

### 10.2 One-liners

- "Drift convierte senales tecnicas de un PR en una decision clara de merge risk."
- "Deuda tecnica IA detectada, priorizada y traducida a acciones concretas antes de mergear."
- "TypeScript AI audit en local y CI, sin depender de infraestructura externa."

---

## 11. KPIs y metricas de exito

| KPI | Objetivo |
|---|---|
| % de PRs evaluados con senial de confianza | Medir adopcion de flujo `review/trust` |
| Reduccion de issues de alto riesgo antes de merge | Medir impacto real en calidad |
| Tiempo desde deteccion a fix | Medir accionabilidad de la salida |
| Conversion a Sponsor/Team | Validar monetizacion temprana |

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigacion |
|---|---|
| Falsos positivos en senal de riesgo | Transparencia en Top Reasons + ajuste iterativo de reglas/pesos |
| Confusion entre "auditoria" y "autofix magico" | Mensaje explicito de que Drift no reemplaza revision humana |
| Presion por features enterprise tempranas | Enfoque por etapas: Sponsors primero, Team/Business luego |
| Variabilidad de entornos CI | Mantener salida portable y documentar integraciones recomendadas |

---

## 13. Definition of Done para este refresh de scope

- PRD unificado con posicionamiento "AI Code Audit CLI".
- `drift trust` definido como feature estrella con output conceptual completo.
- Delimitacion explicita de que Drift es/no es.
- Pricing y Core vs Premium documentados de forma consistente.
- Estrategia operativa sin infraestructura propia y monetizacion via Sponsors declaradas.
- Launch strategy por etapas y copy de posicionamiento incluidos.
