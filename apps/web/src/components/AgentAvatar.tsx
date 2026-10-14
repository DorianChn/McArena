/** Agent 形象标识：α 极速猎手（金色闪电）/ β 深度优化师（蓝色棱晶） */
export function AgentAvatar({
  side,
  size = 44,
  active = false,
}: {
  side: 'alpha' | 'beta'
  size?: number
  active?: boolean
}) {
  const isAlpha = side === 'alpha'
  const accent = isAlpha ? 'var(--alpha-accent)' : 'var(--beta-accent)'
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-xl border transition-shadow ${
        active ? 'shadow-[0_0_0_3px_var(--gold-soft)]' : ''
      }`}
      style={{
        width: size,
        height: size,
        borderColor: accent,
        background: isAlpha ? 'var(--gold-soft)' : 'color-mix(in srgb, var(--beta-accent) 14%, transparent)',
      }}
      role="img"
      aria-label={isAlpha ? 'Agent α 极速猎手' : 'Agent β 深度优化师'}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" aria-hidden="true">
        {isAlpha ? (
          <path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2Z" fill={accent} />
        ) : (
          <g fill={accent}>
            <path d="M12 2 21 7v10l-9 5-9-5V7l9-5Zm0 2.3L5 8.6v6.8l7 3.9 7-3.9V8.6l-7-4.3Z" opacity="0.55" />
            <path d="M12 7.5 16.5 10v4L12 16.5 7.5 14v-4L12 7.5Zm0 2.2L9.6 11v2l2.4 1.3L14.4 13v-2L12 9.7Z" />
          </g>
        )}
      </svg>
      <span
        className="absolute -bottom-1.5 -right-1.5 rounded-md border px-1 text-[10px] font-bold leading-4"
        style={{ borderColor: accent, color: accent, background: 'var(--surface)' }}
      >
        {isAlpha ? 'α' : 'β'}
      </span>
    </span>
  )
}
