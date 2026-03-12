# Plan de Modernización UX/UI — VIDA

> Generado con Gemini + Claude Code | 4 Sprints semanales
> Stack: React 18 + Vite + Tailwind + Framer Motion v12 + shadcn/ui

---

## Sprint 1: "The Core Journey" — Onboarding & Micro-interacciones
**Prioridad:** P1 + P2 | **Complejidad:** L | **Duración:** 1 semana

### 1.1 Onboarding Wizard (P1)
**Objetivo:** Guiar nuevos usuarios en 5 pasos para completar su perfil médico.

**Archivos a crear:**
| Archivo | Descripción |
|---------|-------------|
| `frontend/src/components/onboarding/OnboardingWizard.tsx` | Componente principal con stepper + progress bar |
| `frontend/src/components/onboarding/steps/StepPersonalInfo.tsx` | Paso 1: Nombre, fecha nacimiento, sexo |
| `frontend/src/components/onboarding/steps/StepBloodAllergies.tsx` | Paso 2: Tipo sangre + alergias |
| `frontend/src/components/onboarding/steps/StepConditionsMeds.tsx` | Paso 3: Condiciones + medicamentos |
| `frontend/src/components/onboarding/steps/StepEmergencyContacts.tsx` | Paso 4: Representantes |
| `frontend/src/components/onboarding/steps/StepGenerateQR.tsx` | Paso 5: Generar QR + confetti |
| `frontend/src/hooks/useOnboarding.ts` | Hook: estado del wizard, persistencia localStorage |

**Archivos a modificar:**
| Archivo | Cambio |
|---------|--------|
| `frontend/src/components/pages/Dashboard.tsx` | Redirigir a onboarding si perfil no completado |
| `frontend/src/App.tsx` | Agregar ruta `/onboarding` |
| `frontend/src/lib/animations.ts` | Agregar `stepTransition`, `confettiVariants` |

**Dependencias:** `canvas-confetti` (3KB gzipped)

**Criterios de aceptación:**
- [ ] Wizard recuerda paso actual en localStorage si se recarga
- [ ] Progress bar animada (Framer Motion) muestra avance
- [ ] Transiciones entre pasos con slideInLeft/slideInRight
- [ ] Paso 5: confetti al generar QR exitosamente
- [ ] Skip disponible en cada paso (pero perfil queda incompleto)
- [ ] Mobile-first responsive

**Agente:** `ui-design` + `interaction` + `frontend`

---

### 1.2 Micro-interacciones en Formularios (P2)
**Objetivo:** Feedback visual inmediato en todos los formularios de la app.

**Archivos a crear:**
| Archivo | Descripción |
|---------|-------------|
| `frontend/src/components/ui/AnimatedInput.tsx` | Input con floating label + shake on error |
| `frontend/src/components/ui/AnimatedCheckmark.tsx` | SVG checkmark animado para success |
| `frontend/src/components/ui/AutoSaveIndicator.tsx` | Dot pulsante "Guardado" |

**Archivos a modificar:**
| Archivo | Cambio |
|---------|--------|
| `frontend/src/components/pages/Profile.tsx` | Usar AnimatedInput, AutoSaveIndicator |
| `frontend/src/components/pages/Representatives.tsx` | Usar AnimatedInput |
| `frontend/src/components/pages/Directives.tsx` | Usar AnimatedInput |
| `frontend/src/lib/animations.ts` | Agregar `shakeVariants`, `checkmarkVariants` |

**Criterios de aceptación:**
- [ ] Input shake (3 ciclos, 200ms) al fallar validación
- [ ] Floating label sube con easing al focus
- [ ] Checkmark SVG animado (draw path) al guardar exitosamente
- [ ] AutoSave dot pulsa durante guardado, se fija al completar

**Agente:** `interaction` + `tailwind`

---

## Sprint 2: "Data Pulse" — Dashboard Dinámico & Toasts
**Prioridad:** P1 + P2 | **Complejidad:** M | **Duración:** 1 semana

### 2.1 Health Stats Cards Animadas (P1)
**Objetivo:** Dashboard con métricas animadas y visualmente informativas.

**Archivos a crear:**
| Archivo | Descripción |
|---------|-------------|
| `frontend/src/components/dashboard/HealthStatCard.tsx` | Card con counter animado + trend indicator |
| `frontend/src/components/dashboard/MiniProgressBar.tsx` | Barra de progreso animada |
| `frontend/src/components/dashboard/TrendIndicator.tsx` | Flecha arriba/abajo con color semántico |
| `frontend/src/hooks/useSpringCounter.ts` | Hook: anima número de 0 a N con spring physics |

**Archivos a modificar:**
| Archivo | Cambio |
|---------|--------|
| `frontend/src/components/pages/Dashboard.tsx` | Reemplazar 4 cards estáticos con HealthStatCard |
| `frontend/src/lib/animations.ts` | Agregar `counterSpring`, `trendBounce` |

**Criterios de aceptación:**
- [ ] Números se animan de 0 al valor final al entrar en viewport
- [ ] Trend arrows con micro-bounce al aparecer
- [ ] Progress bar del perfil se llena con animación
- [ ] Cards entran con stagger delay (0.1s entre cada una)
- [ ] Colores: vida-* para positivo, coral-* para alertas

**Agente:** `frontend` + `interaction`

---

### 2.2 Toast Notifications Mejoradas (P2)
**Objetivo:** Sistema de notificaciones con personalidad y utilidad.

**Archivos a crear:**
| Archivo | Descripción |
|---------|-------------|
| `frontend/src/components/ui/CustomToast.tsx` | Toast con spring animation + progress bar |
| `frontend/src/components/providers/ToastProvider.tsx` | Provider global con configuración |

**Archivos a modificar:**
| Archivo | Cambio |
|---------|--------|
| `frontend/src/App.tsx` | Reemplazar `<Toaster />` con `<ToastProvider />` |
| `frontend/src/components/pages/Profile.tsx` | Toast con acción inline "Ver documento" |
| `frontend/src/components/pages/Documents.tsx` | Toast con progress durante upload |

**Criterios de aceptación:**
- [ ] Toast entra con spring (overshoot + settle)
- [ ] Progress bar inferior para procesos largos (PDF generation)
- [ ] Icono animado: check bounce (success), shake (error), spin (loading)
- [ ] Acción inline clickeable ("Ver documento", "Reintentar")
- [ ] Stack visual con profundidad (toasts apilados con scale decreciente)

**Agente:** `interaction` + `frontend`

---

## Sprint 3: "Perceived Performance" — Empty States & Skeletons
**Prioridad:** P2 + P3 | **Complejidad:** M | **Duración:** 1 semana

### 3.1 Empty States Ilustrados (P2)
**Objetivo:** Cada sección vacía comunica qué hacer con identidad visual médica.

**Archivos a crear:**
| Archivo | Descripción |
|---------|-------------|
| `frontend/src/components/ui/illustrations/MedicalDoc.tsx` | SVG documentos médicos |
| `frontend/src/components/ui/illustrations/Stethoscope.tsx` | SVG perfil médico |
| `frontend/src/components/ui/illustrations/Pills.tsx` | SVG medicamentos |
| `frontend/src/components/ui/illustrations/Contacts.tsx` | SVG contactos |
| `frontend/src/components/ui/illustrations/Shield.tsx` | SVG directivas |

**Archivos a modificar:**
| Archivo | Cambio |
|---------|--------|
| `frontend/src/components/ui/EmptyState.tsx` | Agregar prop `illustration` + animación |
| `frontend/src/components/pages/Documents.tsx` | EmptyState con MedicalDoc SVG |
| `frontend/src/components/pages/Profile.tsx` | EmptyState con Stethoscope SVG |
| `frontend/src/components/pages/Representatives.tsx` | EmptyState con Contacts SVG |
| `frontend/src/components/pages/Directives.tsx` | EmptyState con Shield SVG |

**Criterios de aceptación:**
- [ ] SVGs usan tokens vida-*/salud-* (no hardcoded)
- [ ] Animación fadeInUp al montar
- [ ] CTA primario claro ("Agrega tu primer medicamento")
- [ ] SVGs inline < 5KB cada uno

**Agente:** `ui-design` + `tailwind`

---

### 3.2 Skeleton Loaders Personalizados (P3)
**Objetivo:** Skeletons que replican la forma exacta del contenido por página.

**Archivos a crear:**
| Archivo | Descripción |
|---------|-------------|
| `frontend/src/components/ui/skeletons/DocumentsSkeleton.tsx` | Skeleton lista documentos |
| `frontend/src/components/ui/skeletons/DirectivesSkeleton.tsx` | Skeleton directivas |
| `frontend/src/components/ui/skeletons/RepresentativesSkeleton.tsx` | Skeleton contactos |
| `frontend/src/components/ui/skeletons/QRSkeleton.tsx` | Skeleton página QR |

**Archivos a modificar:**
| Archivo | Cambio |
|---------|--------|
| `frontend/src/components/ui/Skeleton.tsx` | Agregar shimmer gradient |
| `frontend/src/components/pages/Documents.tsx` | Usar DocumentsSkeleton |
| `frontend/src/components/pages/Directives.tsx` | Usar DirectivesSkeleton |
| `frontend/src/components/pages/Representatives.tsx` | Usar RepresentativesSkeleton |
| `frontend/src/components/pages/EmergencyQR.tsx` | Usar QRSkeleton |

**Criterios de aceptación:**
- [ ] Cada skeleton replica layout de su página
- [ ] Shimmer gradient (no solo pulse)
- [ ] Crossfade de skeleton a contenido real
- [ ] Consistente con DashboardSkeleton existente

**Agente:** `tailwind` + `ui-design`

---

## Sprint 4: "Mobile Magic" — QR Premium & Bottom Sheets
**Prioridad:** P3 | **Complejidad:** M | **Duración:** 1 semana

### 4.1 QR Code Presentation (P3)
**Objetivo:** El QR de emergencia como elemento hero de la app.

**Archivos a crear:**
| Archivo | Descripción |
|---------|-------------|
| `frontend/src/components/qr/QRReveal.tsx` | Reveal blur-to-sharp + glow |
| `frontend/src/components/qr/QRCardFlip.tsx` | Card flip: frente QR, reverso datos |

**Archivos a modificar:**
| Archivo | Cambio |
|---------|--------|
| `frontend/src/components/pages/EmergencyQR.tsx` | Integrar QRReveal + QRCardFlip |
| `frontend/src/lib/animations.ts` | `revealEffect`, `flipVariants`, `glowPulse` |

**Criterios de aceptación:**
- [ ] QR: blur(10px)→blur(0) + scale 0.9→1
- [ ] Glow pulsante vida-400 (box-shadow animado)
- [ ] Card flip 3D (perspective + rotateY)
- [ ] Reverso: nombre, sangre, alergias, contacto
- [ ] Funcional en iOS Safari (preserve-3d)

**Agente:** `interaction` + `frontend`

---

### 4.2 Bottom Sheets Móviles (P3)
**Objetivo:** Reemplazar modals con bottom sheets nativos en mobile.

**Archivos a crear:**
| Archivo | Descripción |
|---------|-------------|
| `frontend/src/components/ui/BottomSheet.tsx` | Sheet con drag + snap points |
| `frontend/src/hooks/useMediaQuery.ts` | Hook mobile vs desktop |

**Archivos a modificar:**
| Archivo | Cambio |
|---------|--------|
| `frontend/src/components/documents/ShareDocument.tsx` | BottomSheet en mobile |
| `frontend/src/components/ConfirmDialog.tsx` | BottomSheet en mobile |
| `frontend/src/components/panic/PanicAlertModal.tsx` | BottomSheet en mobile |

**Dependencias:** `vaul` (4KB gzipped)

**Criterios de aceptación:**
- [ ] Drag-to-dismiss con velocity threshold
- [ ] Snap points: 50% y 100%
- [ ] Backdrop blur
- [ ] Desktop: dialog normal
- [ ] Accesible: focus trap, ESC, aria labels

**Agente:** `interaction` + `frontend`

---

## Dependencias npm Totales

| Paquete | Sprint | Tamaño |
|---------|--------|--------|
| `canvas-confetti` | 1 | ~3KB gz |
| `vaul` | 4 | ~4KB gz |
| **Total** | | **~7KB gz** |

---

## Extensiones a animations.ts

```typescript
// Sprint 1
export const shakeVariants = {
  shake: { x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.3 } }
};
export const checkmarkDraw = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: { pathLength: 1, opacity: 1, transition: { duration: 0.4, ease: "easeOut" } }
};
export const stepTransition = {
  enter: (dir: number) => ({ x: dir > 0 ? 200 : -200, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -200 : 200, opacity: 0 }),
};

// Sprint 2
export const counterSpring = { type: "spring", stiffness: 50, damping: 15 };
export const trendBounce = {
  initial: { y: 4, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 400, damping: 10 } }
};

// Sprint 4
export const revealEffect = {
  initial: { filter: "blur(10px)", scale: 0.9, opacity: 0 },
  animate: { filter: "blur(0px)", scale: 1, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } }
};
export const flipVariants = {
  front: { rotateY: 0 },
  back: { rotateY: 180 },
};
export const glowPulse = {
  animate: {
    boxShadow: [
      "0 0 20px rgba(59,130,246,0.3)",
      "0 0 40px rgba(59,130,246,0.6)",
      "0 0 20px rgba(59,130,246,0.3)"
    ],
    transition: { duration: 2, repeat: Infinity }
  }
};
```

---

## Métricas de Éxito

| Métrica | Antes | Objetivo |
|---------|-------|----------|
| Perfil completado (nuevos usuarios) | ~30% | >70% |
| Tiempo en dashboard | Bounce rápido | +40% retención |
| Percepción de calidad | Funcional | Premium medical app |
| Lighthouse Performance | >90 | >90 (lazy loading) |
