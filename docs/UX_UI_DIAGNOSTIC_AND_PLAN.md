# Diagnóstico UX/UI y Plan de Remediación — Sistema VIDA

**Fecha:** 2026-03-04
**Versión:** 1.0
**Herramientas disponibles:** 21.dev (Magic MCP), UI UX Pro Max, Frontend Design, Baseline UI, Figma Design Sync, Design Iterator, shadcn/ui MCP

---

## PARTE 1 — DIAGNÓSTICO DETALLADO

### 1.1 Estado Actual del Design System

| Aspecto | Estado | Score |
|---------|--------|-------|
| Color System (HSL vars) | Bien implementado, 60-30-10 | 8/10 |
| Tipografía (Plus Jakarta Sans) | Buena elección, jerarquía parcial | 6/10 |
| Componentes UI | Custom CSS classes, sin librería headless | 4/10 |
| Animaciones | CSS básico, sin Framer Motion | 3/10 |
| Dark Mode | Inexistente | 0/10 |
| Loading/Empty/Error States | Skeletons OK, inconsistentes entre vistas | 6/10 |
| Accesibilidad | Excelente (ARIA, skip links, focus-visible) | 9/10 |
| Responsive/Mobile | Solid mobile-first | 8/10 |
| Micro-interacciones | Mínimas (hover, scale) | 3/10 |
| Consistencia visual | Admin vs User divergen significativamente | 5/10 |

**Score General: 5.2/10**

---

### 1.2 Hallazgos Críticos

#### H1 — Componentes Custom Frágiles (Severidad: ALTA)
Los componentes UI (`btn`, `card`, `badge`, `alert`, `input`) son clases CSS planas en `index.css`. No hay:
- Variantes composables (compound variants)
- Props de tamaño/variante
- Forwarded refs
- Keyboard handling (dropdowns, modals, selects)
- Animaciones de entrada/salida

**Impacto:** Cada nuevo componente reinventa la rueda. Los modales y dropdowns no son accesibles headlessly.

#### H2 — Sin Framer Motion (Severidad: MEDIA-ALTA)
Las reglas de diseño exigen Framer Motion para transiciones entre estados. Solo hay CSS keyframes básicos. Resultado:
- Transiciones de página inexistentes (`.page-enter`/`.page-exit` definidos pero no conectados)
- Sin AnimatePresence para modales
- Sin layout animations
- Sin gestos (drag, swipe)

#### H3 — Purple/Indigo Leak en FeatureGate (Severidad: MEDIA)
`UpgradePrompt.tsx` y `FeatureGate.tsx` usan gradientes `purple/indigo` que:
- Rompen la paleta VIDA (azul médico + coral + salud)
- Violan la regla "no gradientes púrpura sobre blanco"

#### H4 — Admin Panel Desconectado (Severidad: MEDIA)
El panel admin usa `slate-800`/`sky-500` — un design system completamente separado del user-facing. No comparten tokens ni componentes.

#### H5 — Landing Page Genérica (Severidad: ALTA)
La Landing actual es un layout Z estándar con secciones Hero/Features/HowItWorks/CTA. Funcional pero visualmente indistinguible de templates genéricos de SaaS. Para un sistema médico de emergencia, necesita transmitir **confianza, urgencia y profesionalismo médico**.

#### H6 — Dashboard Plano (Severidad: MEDIA-ALTA)
El Dashboard del paciente es una lista vertical de cards sin:
- Data visualization real (solo contadores)
- Progreso visual del perfil médico
- Jerarquía clara de acciones urgentes vs informativas
- Micro-animaciones de estado

#### H7 — Forms Sin Feedback Visual Rico (Severidad: MEDIA)
Los formularios (Login, Register, Profile, Directives) usan validación básica con `react-hook-form` + `zod`, pero:
- Sin animación de shake en error
- Sin success checkmarks animados
- Sin progress indicators en formularios multi-paso (Directives tiene steps pero visualmente plano)
- Sin auto-save visual feedback

#### H8 — Emergency View (PAE) Subutilizada (Severidad: ALTA)
La vista de emergencia (`/emergency/:qrToken`) es la pantalla más crítica del sistema — vista por médicos en urgencias. Necesita:
- Alto contraste inmediato
- Datos vitales en <2 segundos de scan visual
- Acceso a datos SIN scroll
- Diseño optimizado para tablets hospitalarios

---

## PARTE 2 — PLAN DE REMEDIACIÓN POR FASES

### Herramientas y Agentes Asignados

| Herramienta/Agent | Rol |
|--------------------|-----|
| **21.dev (Magic MCP)** | Generación de componentes React con shadcn/ui, inspiración, refinamiento |
| **UI UX Pro Max** | Paletas, font pairings, estilos, stacks, charts |
| **Frontend Design** | Implementación production-grade con diseño distintivo |
| **Baseline UI** | Validación anti-slop, enforcement de estándares |
| **shadcn/ui MCP** | Búsqueda de componentes, auditoría, ejemplos |
| **Design Iterator** | Refinamiento iterativo screenshot-analyze-improve |
| **Framer Motion (a instalar)** | Animaciones, transiciones, gestos |
| **DesignAuditor (`/design-audit`)** | Auditoría post-implementación |
| **UXStrategist (`/ux-strategy`)** | Estrategia UX para flujos críticos |
| **InteractionDesigner (`/interaction`)** | Micro-interacciones y feedback |
| **FrontendDeveloper (`/frontend`)** | Implementación de componentes |
| **TailwindExpert (`/tailwind`)** | Optimización Tailwind, dark mode |

---

### FASE 1 — Fundación del Design System (Sprint 1-2)
**Duración estimada:** 2 sprints de 3-4 días
**Objetivo:** Migrar de CSS classes a componentes React composables con shadcn/ui

#### Sprint 1.1 — Instalación y Componentes Base

| # | Tarea | Agente/Herramienta | Entregable |
|---|-------|--------------------|------------|
| 1.1.1 | Instalar shadcn/ui + Framer Motion + dependencias | `/frontend` + shadcn MCP | `components.json`, deps instaladas |
| 1.1.2 | Configurar shadcn/ui con paleta VIDA (HSL vars existentes) | `/tailwind` + UI UX Pro Max | `tailwind.config.ts` actualizado |
| 1.1.3 | Migrar Button (`btn-*` → shadcn Button con variants VIDA) | 21.dev (component builder) | `ui/button.tsx` |
| 1.1.4 | Migrar Card (`card`/`card-hover` → shadcn Card con motion) | 21.dev + Framer Motion | `ui/card.tsx` |
| 1.1.5 | Migrar Input/Form (`input` → shadcn Input + FormField) | 21.dev | `ui/input.tsx`, `ui/form.tsx` |
| 1.1.6 | Crear Badge, Alert, Dialog, Dropdown desde shadcn | 21.dev | `ui/badge.tsx`, `ui/alert.tsx`, `ui/dialog.tsx`, `ui/dropdown-menu.tsx` |
| 1.1.7 | Crear Tooltip, Sheet (mobile drawer), Tabs | 21.dev | `ui/tooltip.tsx`, `ui/sheet.tsx`, `ui/tabs.tsx` |
| 1.1.8 | Validar con Baseline UI que no haya slop | Baseline UI agent | Report de conformidad |

#### Sprint 1.2 — Tokens, Dark Mode, Animaciones Base

| # | Tarea | Agente/Herramienta | Entregable |
|---|-------|--------------------|------------|
| 1.2.1 | Definir design tokens completos (spacing, radius, shadows) | UI UX Pro Max | `globals.css` tokens |
| 1.2.2 | Implementar dark mode (CSS vars + `dark:` variants) | `/tailwind` | Theme switcher + dark tokens |
| 1.2.3 | Crear animation primitives con Framer Motion | `/interaction` | `lib/animations.ts` (fadeIn, slideUp, scaleIn, stagger) |
| 1.2.4 | Page transitions con AnimatePresence | `/interaction` | Wrapper en `App.tsx` |
| 1.2.5 | Fix purple leak en FeatureGate/UpgradePrompt | `/frontend` | Migrar a `vida-600`/`coral` gradients |
| 1.2.6 | Auditoría visual post-Sprint 1 | `/design-audit` + Design Iterator | Report + fixes |

---

### FASE 2 — Pantallas Críticas (Sprint 3-4)
**Objetivo:** Rediseñar las 3 pantallas de mayor impacto

#### Sprint 2.1 — Emergency View (PAE) Redesign

| # | Tarea | Agente/Herramienta | Entregable |
|---|-------|--------------------|------------|
| 2.1.1 | UX Strategy para flujo de emergencia médica | `/ux-strategy` | Mapa de flujo + wireframes |
| 2.1.2 | Diseño high-fidelity: Emergency View optimizada | Frontend Design + 21.dev (inspiration) | `EmergencyView.tsx` rediseñado |
| 2.1.3 | High-contrast mode automático en Emergency | `/tailwind` + UI UX Pro Max | Auto-detect + forced colors |
| 2.1.4 | Datos vitales above-the-fold sin scroll | `/frontend` | Layout grid optimizado |
| 2.1.5 | Tablet-first responsive para esta vista | `/frontend` | Media queries tablet |
| 2.1.6 | Animación de carga rápida (< 300ms perceived) | `/interaction` | Skeleton + progressive reveal |
| 2.1.7 | Iteración visual (3 ciclos screenshot-improve) | Design Iterator | Refinamiento validado |

#### Sprint 2.2 — Landing Page Redesign

| # | Tarea | Agente/Herramienta | Entregable |
|---|-------|--------------------|------------|
| 2.2.1 | Estrategia de contenido y jerarquía visual | `/ux-strategy` | Content strategy doc |
| 2.2.2 | Inspiración y style guide médico premium | 21.dev (inspiration) + UI UX Pro Max (styles) | Moodboard + style guide |
| 2.2.3 | Hero section con identidad médica fuerte | Frontend Design + 21.dev (builder) | Hero component |
| 2.2.4 | Features section con iconografía custom | 21.dev (builder) + Framer Motion | Features con scroll animations |
| 2.2.5 | Testimonials/Trust section (médicos, pacientes) | 21.dev (builder) | Social proof section |
| 2.2.6 | Pricing section integrada (free vs premium) | 21.dev (builder) | Pricing cards |
| 2.2.7 | Footer profesional con compliance badges | `/frontend` | Footer component |
| 2.2.8 | Validación Baseline UI + Design Iterator (3 ciclos) | Baseline UI + Design Iterator | Pulido final |

---

### FASE 3 — Dashboard y Flujos Core (Sprint 5-6)
**Objetivo:** Elevar la experiencia del paciente day-to-day

#### Sprint 3.1 — Patient Dashboard Redesign

| # | Tarea | Agente/Herramienta | Entregable |
|---|-------|--------------------|------------|
| 3.1.1 | Diseño de dashboard con data viz | UI UX Pro Max (charts) + `/charts` | Chart components (completeness ring, timeline, stats) |
| 3.1.2 | Profile completeness widget (animated ring) | 21.dev (builder) + Framer Motion | `ProfileCompleteness.tsx` |
| 3.1.3 | Quick actions grid (QR, Panic, Docs, Reps) | 21.dev (builder) | Action cards con micro-animations |
| 3.1.4 | Recent activity timeline | 21.dev (builder) | `ActivityTimeline.tsx` |
| 3.1.5 | Emergency readiness indicator | `/interaction` | Visual status indicator |
| 3.1.6 | Responsive layout (bento grid en desktop, stack en mobile) | `/tailwind` + Frontend Design | Bento layout |

#### Sprint 3.2 — Forms y Flujos Multi-Step

| # | Tarea | Agente/Herramienta | Entregable |
|---|-------|--------------------|------------|
| 3.2.1 | Stepper component para Directives (multi-step form) | 21.dev (builder) | `ui/stepper.tsx` |
| 3.2.2 | Form feedback animations (shake, success, progress) | `/interaction` + Framer Motion | Form animation primitives |
| 3.2.3 | Auto-save indicator visual | `/interaction` | `AutoSaveIndicator.tsx` |
| 3.2.4 | Register flow rediseñado (onboarding wizard) | Frontend Design + 21.dev | Onboarding multi-step |
| 3.2.5 | Profile edit con inline validation mejorada | `/frontend` | Profile form refactored |
| 3.2.6 | Auditoría funcional post-fase 3 | `/func-audit` + `/design-audit` | Score y correcciones |

---

### FASE 4 — Polish y Consistencia (Sprint 7-8)
**Objetivo:** Unificar admin panel, micro-interacciones, pulido final

#### Sprint 4.1 — Admin Panel Alignment

| # | Tarea | Agente/Herramienta | Entregable |
|---|-------|--------------------|------------|
| 4.1.1 | Migrar Admin a shadcn/ui components compartidos | `/frontend` + shadcn MCP | Admin usando mismos componentes base |
| 4.1.2 | Dashboard admin con charts reales (recharts/nivo) | `/charts` + 21.dev | Admin charts |
| 4.1.3 | Data tables con sorting, filtering, pagination | 21.dev (builder) | `ui/data-table.tsx` (TanStack Table + shadcn) |
| 4.1.4 | Admin dark theme (ya tiene slate base, extender) | `/tailwind` | Dark mode admin |

#### Sprint 4.2 — Micro-interacciones y Pulido

| # | Tarea | Agente/Herramienta | Entregable |
|---|-------|--------------------|------------|
| 4.2.1 | Haptic feedback patterns (mobile) | `/interaction` | Vibration API integration |
| 4.2.2 | Toast system upgrade (sonner o shadcn toast) | 21.dev + `/frontend` | Toast migration |
| 4.2.3 | Loading states unificados (todos usando Skeleton) | `/frontend` | Skeleton audit + fixes |
| 4.2.4 | Scroll animations (intersection observer) | `/interaction` + Framer Motion | `useScrollAnimation` hook |
| 4.2.5 | Final Baseline UI audit | Baseline UI | Compliance report |
| 4.2.6 | Final Design Iterator pass (5 pantallas clave) | Design Iterator | Screenshots validados |
| 4.2.7 | Performance audit (bundle size post-shadcn) | Performance Oracle agent | Bundle analysis |

---

## PARTE 3 — MATRIZ DE PRIORIZACIÓN

```
          IMPACTO ALTO
              │
   ┌──────────┼──────────┐
   │ Emergency │ Landing  │
   │ View      │ Redesign │
   │ (F2-S1)   │ (F2-S2)  │
   │           │          │
   ├──────────URGENCIA────┤
   │ Dashboard │ Admin    │
   │ Redesign  │ Align    │
   │ (F3-S1)   │ (F4-S1)  │
   │           │          │
   └──────────┼──────────┘
              │
          IMPACTO BAJO
```

**Orden de ejecución recomendado:**
1. Fase 1 (Fundación) — sin esto nada escala
2. Fase 2 Sprint 1 (Emergency View) — es la razón de existir del producto
3. Fase 2 Sprint 2 (Landing) — primera impresión, conversión
4. Fase 3 (Dashboard + Forms) — experiencia diaria
5. Fase 4 (Polish) — consistencia final

---

## PARTE 4 — DEPENDENCIAS Y NUEVAS INSTALACIONES

```bash
# Fase 1
npm install framer-motion
npx shadcn@latest init  # configurar con VIDA HSL tokens
npx shadcn@latest add button card input form badge alert dialog dropdown-menu tooltip sheet tabs

# Fase 3
npm install recharts  # o @nivo/core para charts avanzados

# Fase 4
npx shadcn@latest add toast sonner table
npm install @tanstack/react-table  # data tables admin
```

---

## PARTE 5 — CRITERIOS DE ACEPTACIÓN POR FASE

### Fase 1
- [ ] shadcn/ui instalado y configurado con tokens VIDA
- [ ] Framer Motion instalado, page transitions funcionando
- [ ] Dark mode toggle funcional
- [ ] 0 instancias de clases CSS legacy (`btn-primary`, etc.) — todas migradas
- [ ] Baseline UI: 0 violations
- [ ] Build: tsc 0 errores

### Fase 2
- [ ] Emergency View: datos vitales visibles sin scroll en tablet
- [ ] Emergency View: load time < 1s en 3G
- [ ] Landing: Lighthouse Performance > 90, Accessibility > 95
- [ ] Landing: visualmente diferenciable de templates genéricos
- [ ] Design Iterator: 3+ ciclos con mejoras medibles

### Fase 3
- [ ] Dashboard: profile completeness widget animado
- [ ] Dashboard: al menos 2 data visualizations
- [ ] Forms: animaciones de error/success en todos los formularios
- [ ] Directives: stepper visual funcional

### Fase 4
- [ ] Admin y User app comparten componentes base shadcn
- [ ] Admin: data tables con sort/filter/pagination
- [ ] Bundle size delta < 50KB gzipped vs actual
- [ ] Score Design Audit > 8/10
- [ ] Score Functional Audit > 40/50
