import * as Toast from '@radix-ui/react-toast'
import { useToastStore } from '@/lib/toast'

export function Toaster() {
  const { items, dismiss } = useToastStore()

  return (
    <Toast.Provider swipeDirection="up">
      {items.map((item) => (
        <Toast.Root
          key={item.id}
          open
          duration={Infinity}
          onOpenChange={(open) => { if (!open) dismiss(item.id) }}
          onClick={() => dismiss(item.id)}
          className={`cursor-pointer rounded-full px-4 py-2 shadow-sm text-xs font-medium animate-toast-enter ${
            item.variant === 'destructive'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <Toast.Description>{item.title}</Toast.Description>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 m-0 list-none outline-none" />
    </Toast.Provider>
  )
}
