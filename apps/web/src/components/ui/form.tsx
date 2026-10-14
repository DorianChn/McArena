import type { ReactNode } from 'react'
import { useId } from 'react'

/** 表单行：label + 控件 + 说明/错误 */
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

/** 分段单选（radio group，键盘可访问） */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: Array<{ value: T; label: string; hint?: string }>
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="radiogroup" className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={[
              'min-h-11 rounded-xl border px-4 text-sm font-medium transition-all',
              active
                ? 'border-gold bg-gold-soft text-gold'
                : 'border-line-strong bg-surface/60 text-ink-2 hover:border-gold/60 hover:text-ink',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** 开关 */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-surface/60 px-4 py-2.5">
      <span>
        <span className="block text-sm font-medium text-ink-2">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-3">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          aria-hidden="true"
          className="block h-6 w-11 rounded-full border border-line-strong bg-surface-3 transition peer-checked:border-gold peer-checked:bg-gold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-ink shadow transition-transform peer-checked:translate-x-5 peer-checked:bg-[#201800]"
        />
      </span>
    </label>
  )
}

/** 数字输入（带单位与前缀） */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  id,
  placeholder,
  disabled,
}: {
  value: number | undefined
  onChange: (value: number | undefined) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  id?: string
  placeholder?: string
  disabled?: boolean
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <div className="flex items-center rounded-xl border border-line-strong bg-surface/60 focus-within:border-gold">
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value
          if (raw === '') {
            onChange(undefined)
            return
          }
          const parsed = Number(raw)
          onChange(Number.isFinite(parsed) ? parsed : undefined)
        }}
        className="h-11 w-full min-w-0 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-ink-3 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {suffix && <span className="pr-3 text-xs text-ink-3">{suffix}</span>}
    </div>
  )
}

/** 多选筹码（标签约束） */
export function ChipMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const toggle = (option: string): void => {
    onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(option)}
            className={[
              'min-h-9 rounded-full border px-3.5 text-xs font-medium transition-all',
              active
                ? 'border-gold bg-gold-soft text-gold'
                : 'border-line-strong bg-surface/60 text-ink-3 hover:border-gold/50 hover:text-ink-2',
            ].join(' ')}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
