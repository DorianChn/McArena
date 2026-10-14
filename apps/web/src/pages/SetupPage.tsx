import { useMemo, useState } from 'react'
import type { ChallengeConstraints, Scene } from '@mcarena/shared'
import { Button } from '../components/ui/Button.js'
import { Card, CardBody, CardHeader, SectionTitle } from '../components/ui/Card.js'
import { Field, Segmented, Toggle, NumberInput, ChipMultiSelect } from '../components/ui/form.js'
import { useApp } from '../state/match.js'

/** 预设挑战（全部为合法约束组合，可被 Agent 求解或被裁判判定无效） */
const PRESETS: Array<{
  id: string
  name: string
  desc: string
  constraints: ChallengeConstraints
  seed: number
}> = [
  {
    id: 'budget-20',
    name: '¥20 一人食',
    desc: '1 人堂食、预算 ¥20，考验省钱策略',
    seed: 21,
    constraints: {
      people: 1,
      budgetCents: 2000,
      scene: 'dine-in',
      mustIncludeCodes: [],
      excludedCodes: [],
      requiredTags: [],
      requiredCategories: [],
      preferCoupons: true,
    },
  },
  {
    id: 'two-person',
    name: '双人分享餐',
    desc: '2 人不限预算，必须包含汉堡 + 小食 + 饮品',
    seed: 22,
    constraints: {
      people: 2,
      scene: 'dine-in',
      maxDistinctItems: 4,
      mustIncludeCodes: [],
      excludedCodes: [],
      requiredTags: ['burger', 'side', 'drink'],
      requiredCategories: [],
      nutritionTarget: { kcal: 500, proteinG: 20 },
      preferCoupons: true,
    },
  },
  {
    id: 'protein',
    name: '高蛋白健身餐',
    desc: '2 人预算 ¥40，人均蛋白质 ≥ 30g',
    seed: 23,
    constraints: {
      people: 2,
      budgetCents: 4000,
      scene: 'dine-in',
      mustIncludeCodes: [],
      excludedCodes: [],
      requiredTags: [],
      requiredCategories: [],
      nutritionTarget: { proteinG: 30 },
      preferCoupons: true,
    },
  },
  {
    id: 'family',
    name: '四人家庭聚餐',
    desc: '4 人预算 ¥80，最多 6 种，含营养目标',
    seed: 24,
    constraints: {
      people: 4,
      budgetCents: 8000,
      scene: 'dine-in',
      maxDistinctItems: 6,
      mustIncludeCodes: [],
      excludedCodes: [],
      requiredTags: [],
      requiredCategories: [],
      nutritionTarget: { kcal: 550, proteinG: 22, sodiumMgMax: 1400 },
      preferCoupons: true,
    },
  },
  {
    id: 'no-solution',
    name: '无解挑战（观察裁判）',
    desc: '必选 ¥15 汉堡但预算只有 ¥5——看裁判如何判定无效方案',
    seed: 25,
    constraints: {
      people: 2,
      budgetCents: 500,
      scene: 'dine-in',
      mustIncludeCodes: ['burger-classic'],
      excludedCodes: [],
      requiredTags: [],
      requiredCategories: [],
      preferCoupons: false,
    },
  },
]

const TAG_OPTIONS = ['burger', 'chicken', 'spicy', 'side', 'drink', 'dessert', 'hot', 'light', 'combo']
const CATEGORY_OPTIONS = ['汉堡', '小食', '饮品', '甜品', '套餐', '轻食', '汤品']

const SCENE_OPTIONS: Array<{ value: Scene; label: string; hint?: string }> = [
  { value: 'dine-in', label: '堂食' },
  { value: 'take-away', label: '外带' },
  { value: 'delivery', label: '外送', hint: '外送场景计 ¥5 配送费' },
]

interface FormState {
  people: number
  scene: Scene
  budgetYuan: number | undefined
  maxDistinct: number | undefined
  requiredTags: string[]
  requiredCategories: string[]
  mustIncludeCodes: string
  preferCoupons: boolean
  useNutrition: boolean
  kcal: number | undefined
  proteinG: number | undefined
  sodiumMgMax: number | undefined
  seed: string
}

const INITIAL: FormState = {
  people: 2,
  scene: 'dine-in',
  budgetYuan: 40,
  maxDistinct: 4,
  requiredTags: [],
  requiredCategories: [],
  mustIncludeCodes: '',
  preferCoupons: true,
  useNutrition: false,
  kcal: 500,
  proteinG: 20,
  sodiumMgMax: 1200,
  seed: '',
}

export function SetupPage({ navigate }: { navigate: (route: 'home' | 'setup' | 'arena' | 'result') => void }) {
  const { startMatch } = useApp()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((current) => ({ ...current, [key]: value }))

  const constraints = useMemo<ChallengeConstraints>(() => {
    const mustIncludeCodes = form.mustIncludeCodes
      .split(/[,，\s]+/)
      .map((code) => code.trim())
      .filter((code) => code.length > 0)
    return {
      people: form.people,
      scene: form.scene,
      ...(form.budgetYuan === undefined || Number.isNaN(form.budgetYuan)
        ? {}
        : { budgetCents: Math.round(form.budgetYuan * 100) }),
      ...(form.maxDistinct === undefined || Number.isNaN(form.maxDistinct) ? {} : { maxDistinctItems: form.maxDistinct }),
      mustIncludeCodes,
      excludedCodes: [],
      requiredTags: form.requiredTags,
      requiredCategories: form.requiredCategories,
      ...(form.useNutrition
        ? {
            nutritionTarget: {
              ...(form.kcal !== undefined && !Number.isNaN(form.kcal) ? { kcal: form.kcal } : {}),
              ...(form.proteinG !== undefined && !Number.isNaN(form.proteinG) ? { proteinG: form.proteinG } : {}),
              ...(form.sodiumMgMax !== undefined && !Number.isNaN(form.sodiumMgMax)
                ? { sodiumMgMax: form.sodiumMgMax }
                : {}),
            },
          }
        : {}),
      preferCoupons: form.preferCoupons,
    }
  }, [form])

  const applyPreset = (preset: (typeof PRESETS)[number]): void => {
    const c = preset.constraints
    setForm({
      people: c.people,
      scene: c.scene,
      budgetYuan: c.budgetCents === undefined ? undefined : c.budgetCents / 100,
      maxDistinct: c.maxDistinctItems,
      requiredTags: c.requiredTags,
      requiredCategories: c.requiredCategories,
      mustIncludeCodes: c.mustIncludeCodes.join(', '),
      preferCoupons: c.preferCoupons,
      useNutrition: Boolean(c.nutritionTarget),
      kcal: c.nutritionTarget?.kcal ?? 500,
      proteinG: c.nutritionTarget?.proteinG ?? 20,
      sodiumMgMax: c.nutritionTarget?.sodiumMgMax ?? 1200,
      seed: String(preset.seed),
    })
    setFormError(null)
  }

  const submit = async (): Promise<void> => {
    setFormError(null)
    if (!Number.isInteger(form.people) || form.people < 1 || form.people > 12) {
      setFormError('人数必须是 1–12 之间的整数')
      return
    }
    if (form.budgetYuan !== undefined && (!Number.isFinite(form.budgetYuan) || form.budgetYuan < 0)) {
      setFormError('预算必须是非负数字（留空表示不限预算）')
      return
    }
    if (form.seed.trim() !== '' && !Number.isInteger(Number(form.seed.trim()))) {
      setFormError('种子必须是整数（留空则随机生成）')
      return
    }
    setSubmitting(true)
    try {
      const seed = form.seed.trim() === '' ? undefined : Number(form.seed.trim())
      const result = await startMatch({ seed, constraints })
      if (result) navigate('arena')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle hint="点击预设可一键填充，再做微调">预设挑战</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-2xl border border-line bg-surface/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-gold/60 hover:shadow-[var(--shadow-card)]"
            >
              <p className="text-sm font-bold text-ink">{preset.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">{preset.desc}</p>
              <p className="mt-2 text-[11px] text-gold">种子 {preset.seed} · 点击填充</p>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>自定义约束</SectionTitle>
        <Card>
          <CardHeader title="基础设置" subtitle="人数与场景决定配送费与人数覆盖校验" />
          <CardBody className="space-y-5">
            <Field label="人数" hint="1–12 人；裁判会校验商品总数能否覆盖">
              <Segmented
                value={String(form.people)}
                onChange={(value) => update('people', Number(value))}
                options={[1, 2, 3, 4, 5, 6].map((count) => ({ value: String(count), label: `${count} 人` }))}
              />
            </Field>
            <Field label="用餐场景">
              <Segmented
                value={form.scene}
                onChange={(value) => update('scene', value)}
                options={SCENE_OPTIONS}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="预算（元）" hint="留空表示不限预算">
                <NumberInput
                  value={form.budgetYuan}
                  onChange={(value) => update('budgetYuan', value)}
                  min={0}
                  step={5}
                  suffix="元"
                  placeholder="不限预算"
                />
              </Field>
              <Field label="餐品种类上限" hint="限制不同餐品的数量（1–20）">
                <NumberInput
                  value={form.maxDistinct}
                  onChange={(value) => update('maxDistinct', value)}
                  min={1}
                  max={20}
                  step={1}
                  suffix="种"
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="营养目标" subtitle="按人均值设置；裁判按人数缩放校验" />
          <CardBody className="space-y-5">
            <Toggle
              checked={form.useNutrition}
              onChange={(checked) => update('useNutrition', checked)}
              label="启用营养目标"
              hint="启用后 Agent 会尝试达成目标，裁判独立核算达成率"
            />
            {form.useNutrition && (
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="人均热量">
                  <NumberInput value={form.kcal} onChange={(value) => update('kcal', value)} min={0} step={50} suffix="kcal" />
                </Field>
                <Field label="人均蛋白质">
                  <NumberInput value={form.proteinG} onChange={(value) => update('proteinG', value)} min={0} step={5} suffix="g" />
                </Field>
                <Field label="人均钠上限">
                  <NumberInput value={form.sodiumMgMax} onChange={(value) => update('sodiumMgMax', value)} min={0} step={100} suffix="mg" />
                </Field>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="优惠与高级约束" />
          <CardBody className="space-y-5">
            <Toggle
              checked={form.preferCoupons}
              onChange={(checked) => update('preferCoupons', checked)}
              label="优先使用优惠券"
              hint="Agent 会评估数据集内的可用优惠券；裁判逐张验证使用条件"
            />
            <Field label="必选标签" hint="提案中必须出现带这些标签的餐品（可多选）">
              <ChipMultiSelect
                options={TAG_OPTIONS}
                selected={form.requiredTags}
                onChange={(next) => update('requiredTags', next)}
              />
            </Field>
            <Field label="必选类别" hint="提案中必须出现这些类别的餐品（可多选）">
              <ChipMultiSelect
                options={CATEGORY_OPTIONS}
                selected={form.requiredCategories}
                onChange={(next) => update('requiredCategories', next)}
              />
            </Field>
            <Field label="必选餐品编码" hint="用逗号分隔；编码需存在于当前数据集，例如 burger-classic">
              <input
                value={form.mustIncludeCodes}
                onChange={(event) => update('mustIncludeCodes', event.target.value)}
                placeholder="burger-classic, cola-medium"
                className="h-11 w-full rounded-xl border border-line-strong bg-surface/60 px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-gold"
              />
            </Field>
            <Field label="随机种子" hint="相同种子 + 相同约束 = 完全相同的挑战（可复现）">
              <input
                value={form.seed}
                onChange={(event) => update('seed', event.target.value)}
                inputMode="numeric"
                placeholder="留空则随机生成"
                className="h-11 w-full rounded-xl border border-line-strong bg-surface/60 px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-gold sm:w-64"
              />
            </Field>
          </CardBody>
        </Card>

        {formError && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => void submit()} loading={submitting}>
            ⚔️ 开始对决
          </Button>
          <Button size="lg" variant="ghost" onClick={() => navigate('home')}>
            返回首页
          </Button>
          <p className="text-xs text-ink-3">
            当前约束摘要：{constraints.people} 人 · {constraints.scene === 'dine-in' ? '堂食' : constraints.scene === 'take-away' ? '外带' : '外送'} ·{' '}
            {constraints.budgetCents === undefined ? '不限预算' : `预算 ¥${(constraints.budgetCents / 100).toFixed(0)}`} ·{' '}
            {constraints.requiredTags.length + constraints.requiredCategories.length > 0
              ? `标签/类别约束 ${constraints.requiredTags.length + constraints.requiredCategories.length} 项`
              : '无标签类别约束'}
          </p>
        </div>
      </section>
    </div>
  )
}
