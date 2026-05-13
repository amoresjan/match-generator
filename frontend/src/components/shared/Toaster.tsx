import * as Toast from '@radix-ui/react-toast'
import { CheckCircle2, XCircle, Info } from 'lucide-react'
import { useToastStore } from '@/lib/toast'
import type { ToastVariant } from '@/lib/toast'

const VARIANT_CONFIG: Record<ToastVariant, {
  icon: React.ElementType
  iconCls: string
  bg: string
  border: string
  text: string
}> = {
  success: {
    icon: CheckCircle2,
    iconCls: 'text-[#16a34a] dark:text-[#22c55e]',
    bg: 'bg-[#f0fdf4] dark:bg-green-950/50',
    border: 'border-[#bbf7d0] dark:border-green-800/50',
    text: 'text-[#14532d] dark:text-green-100',
  },
  destructive: {
    icon: XCircle,
    iconCls: 'text-[#ef4444] dark:text-[#f87171]',
    bg: 'bg-[#fef2f2] dark:bg-red-950/50',
    border: 'border-[#fecaca] dark:border-red-800/50',
    text: 'text-[#7f1d1d] dark:text-red-100',
  },
  default: {
    icon: Info,
    iconCls: 'text-[#64748b] dark:text-slate-400',
    bg: 'bg-[#f1f5f9] dark:bg-slate-800/80',
    border: 'border-[#e2e8f0] dark:border-slate-700',
    text: 'text-[#0f172a] dark:text-slate-100',
  },
}

export function Toaster() {
  const { items, dismiss } = useToastStore()

  return (
    <Toast.Provider swipeDirection="up">
      {items.map((item) => {
        const { icon: Icon, iconCls, bg, border, text } = VARIANT_CONFIG[item.variant]
        return (
          <Toast.Root
            key={item.id}
            open={item.open}
            duration={Infinity}
            onOpenChange={(open) => { if (!open) dismiss(item.id) }}
            onClick={() => dismiss(item.id)}
            className={[
              'cursor-pointer flex items-center gap-2.5',
              bg, 'border', border, text,
              'rounded-xl px-3.5 py-2.5',
              'shadow-[0_4px_12px_-2px_rgba(2,8,23,0.12),_0_2px_4px_-1px_rgba(2,8,23,0.08)]',
              'text-sm font-medium max-w-[300px] w-max',
              'data-[state=open]:animate-toast-enter',
              'data-[state=closed]:animate-toast-exit',
            ].join(' ')}
          >
            <Icon className={`h-4 w-4 shrink-0 ${iconCls}`} strokeWidth={2.5} />
            <Toast.Description className="leading-snug">{item.title}</Toast.Description>
          </Toast.Root>
        )
      })}
      <Toast.Viewport className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 m-0 list-none outline-none pointer-events-none [&>li]:pointer-events-auto" />
    </Toast.Provider>
  )
}
