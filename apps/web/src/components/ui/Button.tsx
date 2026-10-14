import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'gold' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-strong active:bg-brand-strong shadow-[0_6px_20px_var(--brand-soft)]',
  gold: 'bg-gold text-[#201800] hover:brightness-105 active:brightness-95 font-bold',
  outline: 'border border-line-strong text-ink hover:border-gold hover:text-gold bg-surface/60',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  danger: 'border border-danger/60 text-danger hover:bg-danger/10',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'h-13 px-7 text-base rounded-xl gap-2.5',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center font-medium transition-all duration-150 select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`mca-spin inline-block rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  )
}
