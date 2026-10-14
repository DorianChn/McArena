export type {
  AgentContext,
  AgentEngine,
  JudgeContext,
  JudgeEngine,
  MatchPhase,
  MatchRun,
  MatchRunState,
  OrchestratorDeps,
  PriceOracle,
  CartSignature,
  RunMatchInput,
} from './types.js'
export { MatchOrchestrator, ORCHESTRATOR_VERSION } from './types.js'
export { MockAgentAlpha, MockAgentBeta, MockJudgeEngine } from './mock/mock-engines.js'
export { buildDevelopmentChallenge, DEV_CONSTRAINT_TEMPLATE } from './dev/challenge.js'

// ---- 阶段03：双 Agent 竞技引擎 ----
export { SpeedAgent } from './engine/agents/speed-agent.js'
export { OptimizerAgent } from './engine/agents/optimizer-agent.js'
export { RuleBasedJudge } from './engine/judge.js'
export { RuleEngine } from './engine/rule-engine.js'
export {
  AgentCancelledError,
  DecisionRecorder,
  SCENE_DELIVERY_FEE_CENTS,
  buildConstraintChecks,
  buildFallbackCart,
  buildRecoveredProposal,
  cartKey,
  cartSubtotal,
  cartTotalQty,
  finalizeProposal,
  sumNutrition,
  toProposalItems,
} from './engine/agent-utils.js'
export { applyCoupons } from './engine/coupons.js'
export type { Cart, FinalizeResult } from './engine/agent-utils.js'

// ---- 阶段06：共享任务卡构造 / 目标预设 / 单局运行器（Web·API·CLI·Skill 唯一实现） ----
export {
  GOAL_PRESETS,
  GOAL_PRESET_KEYS,
  buildChallengeFromParams,
  buildConstraintsFromParams,
  buildCustomChallenge,
  isGoalPresetKey,
} from './engine/challenge-builder.js'
export type { ChallengeParams, GoalPreset, GoalPresetKey } from './engine/challenge-builder.js'
export { runArenaMatch } from './engine/arena-runner.js'
export type { ArenaMatchOutcome, RunArenaMatchInput } from './engine/arena-runner.js'
export { renderMatchHtml } from './render/match-html.js'
export type { RenderMatchHtmlOptions } from './render/match-html.js'
export {
  AgentTimeoutError,
  DEFAULT_AGENT_TIMEOUT_MS,
  runAgent,
} from './engine/agent-runner.js'
export type { AgentRecoveryPolicy, AgentRunnerEvent, AgentRunnerOptions } from './engine/agent-runner.js'
export { ReplayPriceOracle, cartSignatureKey, quoteToCart } from './engine/price-oracle.js'
export { mulberry32, sampleDeterministic, weightedPick } from './engine/prng.js'

// ---- 测试场景与基准对比 ----
export {
  BENCHMARK_SCENARIOS,
  SCENARIO_MENU,
  benchmarkScenario,
  buildScenarioDataset,
  formatBenchmarkReport,
  runBenchmark,
} from './engine/scenarios.js'
export type {
  AgentBenchmarkSummary,
  AgentScenarioMetrics,
  BenchmarkReport,
  BenchmarkScenario,
  ScenarioRunResult,
} from './engine/scenarios.js'
