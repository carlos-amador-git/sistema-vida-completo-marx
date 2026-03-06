# Plan: Fixes UX/UI Post-Auditoría — Sistema VIDA

## Origen
Auditoría paralela con 3 agentes (UI UX Pro Max, Design Auditor, A11y + Baseline).
**Calificación final: 74/100 (B-)**
**Meta post-fix: ~85/100 (B+/A-)**

---

## P0 — Críticos (hacer primero)

### P0-1: QR Code negro
- **Archivo:** `frontend/src/components/pages/EmergencyQR.tsx:120`
- **Cambio:** `fgColor="#0d6ecd"` → `fgColor="#000000"`
- **Por qué:** QR azul falla con cámaras viejas/mala iluminación. Riesgo de vida real.
- **Esfuerzo:** 30 seg

### P0-2: useReducedMotion en AnimatedIcon
- **Archivo:** `frontend/src/components/ui/AnimatedIcon.tsx`
- **Cambio:** Importar `useReducedMotion` de framer-motion, gate todas las animaciones
- **Por qué:** CSS `animation-duration: 0.01ms` NO afecta Framer Motion JS animations
- **Esfuerzo:** 15 min

### P0-3: useReducedMotion en OnboardingWizard
- **Archivo:** `frontend/src/components/onboarding/OnboardingWizard.tsx`
- **Cambio:** Conditional variants basados en useReducedMotion()
- **Esfuerzo:** 15 min

### P0-4: useReducedMotion en CustomToast
- **Archivo:** `frontend/src/components/ui/CustomToast.tsx`
- **Cambio:** Entrada sin spring si reduced motion
- **Esfuerzo:** 10 min

### P0-5: Reemplazar 5x window.confirm() con shadcn Dialog
- **Archivos:**
  - `frontend/src/components/pages/EmergencyQR.tsx`
  - `frontend/src/components/pages/Representatives.tsx`
  - `frontend/src/components/pages/Directives.tsx` (x2)
  - `frontend/src/components/pages/BiometricSettings.tsx`
- **Cambio:** Crear componente `ConfirmDialog.tsx` reutilizable con shadcn Dialog, reemplazar los 5 usos
- **Por qué:** confirm() no estilizable, no localizable, unreliable en PWA standalone iOS
- **Esfuerzo:** 2 hrs

---

## P1 — Importantes (segunda ronda)

### P1-1: Dark mode token sweep
- **Archivos:** Dashboard.tsx, MainLayout.tsx (sidebar), Profile.tsx, cards varios
- **Cambio:** Reemplazar `text-gray-900` → `text-foreground`, `bg-white` → `bg-background`, etc.
- **Por qué:** Texto invisible en dark mode
- **Esfuerzo:** 3 hrs

### P1-2: Migrar coral/salud a CSS variables HSL
- **Archivo:** `frontend/src/index.css` (definir variables) + archivos que usan coral-*/salud-*
- **Cambio:** Definir `--coral-*` y `--salud-*` como HSL en :root y .dark
- **Por qué:** Paletas hardcodeadas hex → dark mode ciego para badges/trends
- **Esfuerzo:** 1 hr

### P1-3: Remover confetti del onboarding
- **Archivo:** `frontend/src/components/onboarding/OnboardingWizard.tsx:35-40`
- **Cambio:** Reemplazar canvas-confetti con checkmark animado sutil
- **Por qué:** Confetti inapropiado para contexto médico (sangre, alergias, contactos emergencia)
- **Esfuerzo:** 30 min

### P1-4: Notification badge reduced-motion
- **Archivo:** `frontend/src/components/layouts/MainLayout.tsx:209`
- **Cambio:** Agregar `motion-reduce:animate-none` al badge con `animate-pulse`
- **Esfuerzo:** 1 min

---

## P2 — Mejoras de accesibilidad

### P2-1: ARIA en combobox aseguradora
- **Archivo:** `frontend/src/components/pages/Profile.tsx:387`
- **Cambio:** Agregar `role="combobox"`, `aria-expanded`, `aria-haspopup="listbox"`, `aria-controls`, `role="listbox"`, `role="option"`, `aria-selected`, `htmlFor`
- **Esfuerzo:** 1 hr

### P2-2: Focus trap en sidebar móvil
- **Archivo:** `frontend/src/components/layouts/MainLayout.tsx:101-177`
- **Cambio:** Usar Radix Dialog o focus-trap-react para el sidebar móvil
- **Esfuerzo:** 1 hr

### P2-3: Limpiar landing page slop
- **Archivo:** `frontend/src/components/pages/Landing.tsx`
- **Cambios:**
  - Remover gradiente rotado decorativo (línea ~195)
  - Simplificar hero section bg a `bg-white` o patrón sutil
  - CTA section: solid `bg-vida-800` en vez de gradiente
  - Remover violet del demo panel en Login.tsx
- **Esfuerzo:** 1 hr

### P2-4: BottomSheet desktop dialog semantics
- **Archivo:** `frontend/src/components/ui/BottomSheet.tsx:29-47`
- **Cambio:** Agregar `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trap, close button
- **Esfuerzo:** 45 min

### P2-5: Redundant role="button" cleanup
- **Archivos:** PanicButton.tsx (líneas 316, 388)
- **Cambio:** Remover `role="button"` de elementos `<button>` nativos
- **Esfuerzo:** 5 min

### P2-6: Progress bar ARIA en OnboardingWizard
- **Archivo:** `frontend/src/components/onboarding/OnboardingWizard.tsx:80-97`
- **Cambio:** `role="progressbar"`, `aria-valuemin/max/now`, `aria-current="step"`, wrap steps en `<ol>`
- **Esfuerzo:** 30 min

---

## P3 — Polish

### P3-1: Touch targets ≥24px en tags
- **Archivo:** `frontend/src/components/pages/Profile.tsx:250`
- **Cambio:** Delete buttons de alergias/condiciones/medicamentos: `p-0.5` → `p-1.5`
- **Esfuerzo:** 10 min

### P3-2: Allergy/condition lists semánticas
- **Archivo:** `frontend/src/components/pages/Profile.tsx:246-262`
- **Cambio:** `<div flex-wrap>` → `<ul>` con `<li>`, agregar `aria-label`
- **Esfuerzo:** 20 min

### P3-3: Toast dismiss button size
- **Archivo:** `frontend/src/components/ui/CustomToast.tsx:98`
- **Cambio:** Agregar `p-2` al botón dismiss (16x16 → 32x32)
- **Esfuerzo:** 2 min

### P3-4: Heading hierarchy en Dashboard
- **Archivo:** `frontend/src/components/pages/Dashboard.tsx:212`
- **Cambio:** Agregar `<h2 className="sr-only">` antes de la sección de 3 cards
- **Esfuerzo:** 2 min

### P3-5: QR token visibility
- **Archivo:** `frontend/src/components/pages/EmergencyQR.tsx:125-132`
- **Cambio:** `text-xs text-gray-400` → `text-sm text-gray-700` + botón "Copiar enlace"
- **Esfuerzo:** 15 min

### P3-6: Landing avatars aria-hidden
- **Archivo:** `frontend/src/components/pages/Landing.tsx:183-191`
- **Cambio:** Agregar `aria-hidden="true"` al container de avatares decorativos
- **Esfuerzo:** 1 min

### P3-7: Dashboard QR link visibility
- **Archivo:** `frontend/src/components/pages/Dashboard.tsx:88-106`
- **Cambio:** `bg-white/20` → botón sólido con contraste adecuado
- **Esfuerzo:** 15 min

### P3-8: Error state en EmergencyQR
- **Archivo:** `frontend/src/components/pages/EmergencyQR.tsx:73-85`
- **Cambio:** Agregar `role="alert"` al container, focus ring + min-h al botón retry
- **Esfuerzo:** 5 min

### P3-9: PanicButton accesibilidad motora
- **Archivo:** `frontend/src/components/panic/PanicButton.tsx:169-191`
- **Cambio:** Considerar setting para "tap + confirm" alternativo al hold (usuarios con tremor)
- **Esfuerzo:** 2 hrs (feature nueva)

### P3-10: Skip button size en OnboardingWizard
- **Archivo:** `frontend/src/components/onboarding/OnboardingWizard.tsx:68-75`
- **Cambio:** Agregar `px-3 py-2` al botón "Omitir"
- **Esfuerzo:** 1 min

---

## Scores Actuales vs Meta

| Categoría | Actual | Post P0+P1 |
|-----------|--------|------------|
| Visual & Branding | 8.5 | 8.5 |
| Componentes | 8.0 | 8.5 |
| Animaciones | 8.5 | 9.0 |
| Dark Mode | 5.0 | 8.0 |
| Accesibilidad | 5.0 | 7.0 |
| Emergencia | 5.5 | 8.0 |
| Landing | 6.0 | 6.0 |
| Formularios | 7.0 | 7.0 |
| Mobile/Touch | 7.5 | 7.5 |
| Consistencia | 7.0 | 8.0 |
| **TOTAL** | **74** | **~85** |

---

## Estado
- [x] P0 — COMPLETADO (sesión 2026-03-05)
- [x] P1 — COMPLETADO (sesión 2026-03-05)
- [x] P2 — COMPLETADO (sesión 2026-03-05)
- [x] P3 — COMPLETADO (sesión 2026-03-05)

## Notas de implementación
- ConfirmDialog API migrada: `variant="destructive"`, `onOpenChange` (vs old `variant="danger"`, `onCancel`)
- AdminSystemHealth.tsx actualizado a nueva API
- tapMode prop en PanicButton: single-tap → confirm dialog (para tremor/motor)
- Focus management en sidebar móvil: ref en close/open buttons + aria-hidden en main cuando sidebar abierto
- Login demo panel: violet → vida tokens
- Landing: gradiente decorativo rotado removido, CTA solid bg-vida-800
- ARIA combobox completo en insurance dropdown (role=combobox, listbox, option, aria-selected)
- Build: ✓ 0 errores
