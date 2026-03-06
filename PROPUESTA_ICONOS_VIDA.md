# Propuesta de Reemplazo de Iconos – Sistema VIDA
## Basado en 21st.dev Magic UI, UI UX Pro Max, y animaciones de alta fidelidad

**Fecha:** 4 de marzo de 2026
**Autor:** Gemini (Líder Estratégico)
**Revisión:** Claude Code (Auditoría técnica post-Sprint UX)

---

## 0. Estado Actual Post-Sprints UX (LEER PRIMERO)

> **IMPORTANTE:** Ya se implementaron 4 sprints de mejoras UX/UI que cubren parcialmente esta propuesta. Gemini debe considerar este estado antes de ejecutar.

### Ya implementado (no duplicar):
- **5 ilustraciones SVG animadas** para Empty States: `MedicalDoc`, `Stethoscope`, `Pills`, `Contacts`, `Shield` en `src/components/ui/illustrations/` — usan `framer-motion` + `fadeInUp`
- **AnimatedCheckmark** (`src/components/ui/AnimatedCheckmark.tsx`) — SVG draw animation con `pathLength`
- **Skeleton Loaders** con shimmer gradient (no pulse) — 4 variantes: Documents, Directives, Representatives, QR
- **QR Reveal** con blur-to-sharp + glow pulse (`src/components/qr/QRReveal.tsx`)
- **QR Card Flip** 3D con perspective (`src/components/qr/QRCardFlip.tsx`)
- **CustomToast** con spring physics y progress bar (`src/components/ui/CustomToast.tsx`)
- **HealthStatCard** con `useSpringCounter` + `TrendIndicator` animado (`src/components/dashboard/`)
- **Onboarding Wizard** 5 pasos con `AnimatePresence` + confetti (`src/components/onboarding/`)
- **BottomSheet** responsive con vaul (`src/components/ui/BottomSheet.tsx`)
- **AnimatedInput** con floating labels + shake on error (`src/components/ui/AnimatedInput.tsx`)
- **AutoSaveIndicator** con estados saving/saved (`src/components/ui/AutoSaveIndicator.tsx`)
- **Librería de animaciones** extendida en `src/lib/animations.ts`: `shakeVariants`, `checkmarkDraw`, `stepTransition`, `counterSpring`, `trendBounce`, `revealEffect`, `flipVariants`, `glowPulse`

### Lucide-react: 33 archivos lo importan actualmente

---

## 1. Análisis del Estado Actual

Tras analizar el código fuente del frontend (`frontend/src/components/*`), se detectó el uso extensivo de la librería estática **`lucide-react`** (33 archivos). Post-sprints UX, ya tenemos Framer Motion v12 integrado profundamente con animaciones custom, pero los iconos inline siguen siendo estáticos.

Ejemplos de uso actual:
- *Paneles y Dashboards:* `<TrendingUp>`, `<Users>`, `<Shield>`
- *Acciones y Navegación:* `<ChevronRight>`, `<X>`, `<Globe>`
- *Salud y Emergencias:* `<Stethoscope>`, `<Pill>`, `<Droplets>`, `<AlertCircle>`

---

## 2. Visión Estratégica para el Reemplazo

El objetivo es transicionar los iconos inline restantes del **"Static Flat"** a **"Interactive"**, sin sobre-ingeniería.

### REVISIÓN CLAUDE — Principios de implementación:

1. **NO purgar Lucide por completo.** Lucide es la librería de iconos de shadcn/ui (que ya usamos). Reemplazar 33 archivos por otra librería introduce inconsistencia y riesgo. En su lugar: **envolver selectivamente** los iconos de alto impacto con `motion.div` para animarlos.

2. **NO agregar Lottie.** Lottie agrega ~50KB+ al bundle y requiere archivos JSON separados. Ya tenemos Framer Motion v12 que hace todo lo que necesitamos para animaciones de iconos SVG.

3. **NO agregar Radix Icons ni Heroicons como reemplazo.** Mezclar 3 librerías de iconos genera inconsistencia visual. Lucide cubre todo el catálogo necesario y es mantenido activamente.

4. **NO usar "3D Glassmorphism Icons".** En una app médica de emergencia, la claridad visual es prioritaria. Glassmorphism en iconos pequeños reduce legibilidad, especialmente en condiciones de estrés (que es exactamente cuando se usa esta app).

5. **SÍ animar selectivamente** los iconos de alta interacción usando `motion.div` wrappers o SVG `motion.path` con las variantes que ya existen en `animations.ts`.

### A. Iconos con Micro-animación (Framer Motion — YA DISPONIBLE)
Para iconos de alta interacción, envolver con `motion` para agregar:
- **Draw-in** al aparecer (usando `pathLength` como ya funciona en `AnimatedCheckmark`)
- **Scale spring** al hover/tap
- **Rotate** suave en iconos de configuración

### B. Iconografía Hero y Empty States — YA IMPLEMENTADO
Las 5 ilustraciones SVG animadas ya cubren los Empty States principales. Si se necesitan más, seguir el mismo patrón existente (`motion.svg` + `fadeInUp` + Tailwind classes).

### C. Iconos Funcionales (MANTENER Lucide)
Para iconos en tablas, listas densas, navegación secundaria: mantener Lucide tal cual. Son 24px consistentes, tree-shakeable, y coherentes con shadcn/ui.

---

## 3. Matriz de Reemplazo Revisada

| Contexto | Estado Actual | Acción Propuesta | Prioridad |
|----------|--------------|------------------|-----------|
| **Empty States** | 5 SVGs animados implementados | Agregar más si se necesitan (seguir patrón existente) | HECHO |
| **Checkmarks/Success** | `AnimatedCheckmark` implementado | Usar en más lugares (toasts, formularios) | HECHO |
| **Dashboard Stats** | `HealthStatCard` con spring counters | Extender a más métricas si se agregan | HECHO |
| **QR Presentation** | `QRReveal` + `QRCardFlip` implementados | Listo | HECHO |
| **Navegación (Menu/X)** | Lucide estático | Envolver con `motion.div` + morphing (rotate 45°) | P2 |
| **Emergencia (Heart/Alert)** | Lucide estático | Agregar `animate={{ scale: [1, 1.2, 1] }}` pulse | P1 |
| **Configuración (Settings)** | Lucide estático | Agregar `whileHover={{ rotate: 90 }}` | P3 |
| **Onboarding icons** | Lucide con stagger | Ya tienen AnimatePresence, mejorar con draw-in | P3 |

---

## 4. Plan de Implementación (Revisado)

### Fase 1 — Componente `AnimatedIcon` wrapper (P1)
Crear `src/components/ui/AnimatedIcon.tsx` — wrapper genérico que acepta cualquier icono Lucide y le agrega comportamiento animado configurable:

```tsx
// API propuesta
<AnimatedIcon
  icon={Heart}
  animation="pulse"    // pulse | draw | spin | bounce | none
  trigger="mount"      // mount | hover | tap | inView
  className="text-coral-500"
  size={24}
/>
```

Animaciones disponibles usando variantes de `animations.ts` que ya existen.

### Fase 2 — Aplicar en zonas de alto impacto (P1-P2)
1. `PanicButton` — Heart con pulse
2. `MainLayout` sidebar — iconos con scale spring al hover
3. `Dashboard` — iconos de stats con draw-in al entrar en viewport
4. `EmergencyQR` — ya tiene QRReveal, agregar beacon al icono de alerta

### Fase 3 — Refinamiento (P3)
- Morphing Menu/X en mobile header
- Settings gear rotation on hover
- Onboarding step icons con draw-in secuencial

### NO hacer:
- No instalar Lottie, Radix Icons, Heroicons, ni ninguna dependencia adicional de iconos
- No purgar Lucide — es la librería estándar de shadcn/ui
- No usar glassmorphism en iconos funcionales
- No crear ilustraciones con nano-banana-pro (las SVG manuales son más livianas y controlables)

---

## 5. Dependencias

**Ninguna nueva.** Todo se resuelve con el stack actual:
- `lucide-react` (mantener)
- `framer-motion` v12 (ya instalado)
- `tailwind` + variables CSS (ya configurado)
- Variantes de animación en `src/lib/animations.ts` (ya extendido)
