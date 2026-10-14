import { useId } from 'react'

export interface RadarSeries {
  name: string
  /** 0–max 的得分序列 */
  values: number[]
  color: string
}

/**
 * 五维雷达图（纯 SVG，零依赖）。
 * dimensions：维度中文名；maxes：各维度满分；series：1–2 组数据。
 */
export function Radar({
  dimensions,
  maxes,
  series,
  size = 260,
  className = '',
}: {
  dimensions: string[]
  maxes: number[]
  series: RadarSeries[]
  size?: number
  className?: string
}) {
  const titleId = useId()
  const center = size / 2
  const radius = center - 34
  const count = dimensions.length
  const angleOf = (index: number): number => (Math.PI * 2 * index) / count - Math.PI / 2
  const pointOf = (index: number, ratio: number): [number, number] => {
    const angle = angleOf(index)
    return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio]
  }

  const rings = [0.25, 0.5, 0.75, 1]
  const summary = series
    .map((entry) => `${entry.name}：${entry.values.map((value, index) => `${dimensions[index]} ${value.toFixed(1)}`).join('、')}`)
    .join('；')

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      className={className}
      role="img"
      aria-labelledby={titleId}
      style={{ maxWidth: size }}
    >
      <title id={titleId}>{`五维评分雷达图：${summary}`}</title>
      {/* 网格环 */}
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={dimensions.map((_, index) => pointOf(index, ring).join(',')).join(' ')}
          fill="none"
          stroke="var(--line)"
          strokeWidth={ring === 1 ? 1.5 : 1}
        />
      ))}
      {/* 轴线与维度标签 */}
      {dimensions.map((dimension, index) => {
        const [x, y] = pointOf(index, 1.12)
        return (
          <g key={dimension}>
            <line
              x1={center}
              y1={center}
              x2={pointOf(index, 1)[0]}
              y2={pointOf(index, 1)[1]}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--ink-3)"
              fontSize={11}
            >
              {dimension}
            </text>
          </g>
        )
      })}
      {/* 数据多边形 */}
      {series.map((entry) => (
        <polygon
          key={entry.name}
          points={entry.values
            .map((value, index) => pointOf(index, Math.max(0, Math.min(1, value / (maxes[index] ?? 1)))).join(','))
            .join(' ')}
          fill={entry.color}
          fillOpacity={0.16}
          stroke={entry.color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ))}
      {series.map((entry) =>
        entry.values.map((value, index) => {
          const [x, y] = pointOf(index, Math.max(0, Math.min(1, value / (maxes[index] ?? 1))))
          return <circle key={`${entry.name}-${index}`} cx={x} cy={y} r={3} fill={entry.color} />
        }),
      )}
    </svg>
  )
}
