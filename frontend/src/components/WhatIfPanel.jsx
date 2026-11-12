import { CloudRain, Flame, Sparkles, Trophy, X } from 'lucide-react'

const PRESETS = [
  {
    id: 'rain',
    label: 'What if it rains at 5 PM?',
    hi: 'शाम 5 बजे बारिश हो तो?',
    icon: CloudRain,
    overrides: {
      weatherLabel: 'Heavy Rain (5 PM Simulation)',
      weatherFootfallImpact: 0.65,
      rainProbabilityPeak: 85,
    },
  },
  {
    id: 'event',
    label: 'What if there is a big event?',
    hi: 'पास में बड़ा मेला/इवेंट हो तो?',
    icon: Sparkles,
    overrides: {
      eventName: 'Hazratganj Evening Mela (What-If)',
      eventExpectedFootfall: 'high',
    },
  },
  {
    id: 'match',
    label: 'What if Ekana has a night match?',
    hi: 'इकाना में बड़ा मैच हो तो?',
    icon: Trophy,
    overrides: {
      matchPresent: true,
    },
  },
  {
    id: 'social',
    label: 'What if #Hazratganj buzzes?',
    hi: 'सोशल मीडिया पर भीड़ बढ़े तो?',
    icon: Flame,
    overrides: {
      socialSpike: true,
    },
  },
]

function formatInr(value) {
  return Number.isFinite(Number(value))
    ? `₹${Math.round(Number(value)).toLocaleString('en-IN')}`
    : '--'
}

export default function WhatIfPanel({
  baselineForecast,
  simulationResult,
  loading,
  error,
  onSimulate,
  onClear,
  disabled,
}) {
  if (!baselineForecast) return null

  const baselineMap = new Map(
    (baselineForecast.procurementList ?? []).map((row) => [
      row.item.toLowerCase(),
      row,
    ]),
  )
  const simPlan = simulationResult?.plan ?? null

  return (
    <section className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            What-If Simulation Mode
          </p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
            Test scenarios without changing your saved plan
          </h3>
        </div>
        {simulationResult ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)]"
          >
            <X size={14} />
            Clear comparison
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const Icon = preset.icon
          const active = simulationResult?.scenarioLabel === preset.label
          return (
            <button
              key={preset.id}
              type="button"
              disabled={loading || disabled}
              onClick={() => onSimulate(preset.overrides, preset.label)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? 'border-[var(--color-primary)] bg-[rgba(250,204,21,0.18)] text-[var(--color-text-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]'
              }`}
            >
              <Icon size={14} className="text-[var(--color-primary)]" />
              <span>{preset.label}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
          Running simulation on separate thread (not saved to history)...
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-xs text-[var(--color-danger)]">{error}</p>
      ) : null}

      {simPlan ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgba(250,204,21,0.35)] bg-[rgba(250,204,21,0.08)] px-4 py-2.5">
            <span className="text-xs font-semibold text-[var(--color-text-primary)]">
              Scenario: {simulationResult.scenarioLabel}
            </span>
            <span className="rounded-full border border-[var(--color-primary)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-primary)]">
              Simulation only — not persisted
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] p-4">
              <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                Baseline Plan
              </p>
              <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">
                {Math.round(baselineForecast.expectedCustomers ?? 0)} customers
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Cost: {formatInr(baselineForecast.financials?.totalCostInr)} | Est. Profit:{' '}
                {formatInr(baselineForecast.financials?.expectedProfitInr)}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--color-primary)] bg-[rgba(250,204,21,0.08)] p-4">
              <p className="text-xs uppercase tracking-wider text-[var(--color-primary)]">
                What-If Plan
              </p>
              <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">
                {Math.round(simPlan.expectedCustomers ?? 0)} customers
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Cost: {formatInr(simPlan.financials?.totalCostInr)} | Est. Profit:{' '}
                {formatInr(simPlan.financials?.expectedProfitInr)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--color-bg-input)] text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Item</th>
                  <th className="px-4 py-2.5 font-semibold">Baseline Buy</th>
                  <th className="px-4 py-2.5 font-semibold text-[var(--color-primary)]">
                    What-If Buy
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-bg-card)]">
                {(simPlan.procurementList ?? []).map((simRow) => {
                  const baseRow = baselineMap.get(simRow.item.toLowerCase())
                  return (
                    <tr key={simRow.item}>
                      <td className="px-4 py-2.5 font-semibold text-[var(--color-text-primary)]">
                        {simRow.item}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                        {baseRow?.toBuy ?? '0 (sufficient)'}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-[var(--color-primary)]">
                        {simRow.toBuy}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  )
}

