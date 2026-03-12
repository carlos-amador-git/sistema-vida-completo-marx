import { ReactNode } from 'react';
import { Drawer } from 'vaul';
import { useIsMobile } from '../../hooks/useMediaQuery';

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  title?: string;
  description?: string;
  snapPoints?: (string | number)[];
}

export function BottomSheet({
  open,
  onOpenChange,
  children,
  title,
  description,
  snapPoints,
}: BottomSheetProps) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    // Desktop: render as centered dialog
    if (!open) return null;

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'bottom-sheet-title' : undefined}
            className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
          >
            {title && (
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 id="bottom-sheet-title" className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
                {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
              </div>
            )}
            <div className="p-4">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mobile: vaul drawer
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={snapPoints}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 mt-24 flex h-auto flex-col rounded-t-2xl bg-white dark:bg-gray-800">
          {/* Drag handle */}
          <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />

          {title && (
            <div className="px-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <Drawer.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </Drawer.Title>
              {description && (
                <Drawer.Description className="text-sm text-gray-500 mt-1">
                  {description}
                </Drawer.Description>
              )}
            </div>
          )}

          <div className="p-4 overflow-y-auto max-h-[70vh] pb-safe">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
