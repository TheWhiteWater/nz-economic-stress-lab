"use client";

import { useMemo, useState } from "react";
import { calculateStress, initial, type Inputs } from "@/lib/economic-model";

const fmt = (n: number, d = 0) =>
  new Intl.NumberFormat("en-NZ", { maximumFractionDigits: d }).format(n);

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="control">
      <span>
        <b>{label}</b>
        <output>
          {fmt(value, step < 1 ? 3 : 0)}
          {suffix}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export default function Home() {
  const [v, setV] = useState(initial);
  const set = (key: keyof Inputs) => (value: number) => setV((o) => ({ ...o, [key]: value }));
  const result = useMemo(() => calculateStress(v), [v]);
  const maxBar = Math.max(...result.rows.map((r) => r.reserve), 1);
  const crisisGross = result.rows
    .filter((r) => r.isCrisis)
    .reduce((s, r) => s + r.grossCollateralLoss, 0);
  const lossTotal = Math.max(
    1,
    result.totalInsurerClaims + result.totalBankFirstLoss + result.totalBankExcessLoss,
  );
  const currentSystemFailsHigherCapital = result.currentSystemPeakBankHit > result.higherCapitalBuffer;

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="mark">NZ</span>
          <span>Economic Stress Lab</span>
        </div>
        <div className="status">
          <i />
          Engine-aligned model · v0.2
        </div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">MORTGAGE SYSTEM STRESS TEST · 2026–2036</p>
          <h1>
            Who absorbs the loss
            <br />
            when housing breaks?
          </h1>
        </div>
        <p className="lede">
          Scenario model comparing bank capital, loan-level mortgage insurance, aggregate
          reinsurance and Crown liquidity. Change the assumptions. Try to kill the proposal.
        </p>
      </section>

      <section className="workspace">
        <aside className="panel controls">
          <div className="panelTitle">
            <span>Scenario inputs</span>
            <button onClick={() => setV(initial)}>Reset</button>
          </div>
          <h3>Market & programme</h3>
          <Slider label="Mortgage market" value={v.market} min={200} max={600} step={10} suffix="bn" onChange={set("market")} />
          <Slider label="Annual migration" value={v.migration} min={2} max={25} step={1} suffix="%" onChange={set("migration")} />
          <Slider label="Average premium" value={v.premium} min={0.05} max={0.6} step={0.0025} suffix="%" onChange={set("premium")} />
          <Slider label="Initial reserve" value={v.initialCapital} min={0} max={2000} step={50} suffix="m" onChange={set("initialCapital")} />

          <h3>Insurer balance</h3>
          <Slider label="Normal collateral loss" value={v.normalLoss} min={0} max={0.2} step={0.005} suffix="%" onChange={set("normalLoss")} />
          <Slider label="Reinsurance premium" value={v.reinsuranceCost} min={0} max={0.2} step={0.005} suffix="%" onChange={set("reinsuranceCost")} />
          <Slider label="Annual operating cost" value={v.operatingCost} min={0} max={50} step={1} suffix="m" onChange={set("operatingCost")} />
          <Slider label="Reserve yield" value={v.investmentYield} min={0} max={7} step={0.25} suffix="%" onChange={set("investmentYield")} />

          <h3>Crisis</h3>
          <Slider label="Crisis starts" value={v.crisisYear} min={1} max={10} step={1} suffix=" yr" onChange={set("crisisYear")} />
          <Slider label="Crisis duration" value={v.crisisYears} min={1} max={3} step={1} suffix=" yr" onChange={set("crisisYears")} />
          <Slider label="Crisis collateral loss" value={v.crisisLoss} min={0.5} max={8} step={0.25} suffix="%" onChange={set("crisisLoss")} />
          <Slider label="Bank first-loss" value={v.bankFirstLoss} min={0} max={60} step={5} suffix="%" onChange={set("bankFirstLoss")} />
          <Slider label="Aggregate reinsured share" value={v.reinsuranceShare} min={0} max={80} step={5} suffix="%" onChange={set("reinsuranceShare")} />
        </aside>

        <div className="results">
          <div className="cards">
            <article>
              <span>Year 10 reserve</span>
              <strong>${fmt(result.reserve)}m</strong>
              <small>{(result.reserve / (v.market * 1000) * 100).toFixed(2)}% of market</small>
            </article>
            <article className={result.crownDraw > 0 ? "warn" : "good"}>
              <span>Crown liquidity drawn</span>
              <strong>${fmt(result.crownDraw)}m</strong>
              <small>${fmt(result.crownDebtRemaining)}m debt remaining</small>
            </article>
            <article>
              <span>Gross crisis loss</span>
              <strong>${fmt(crisisGross)}m</strong>
              <small>loan-level collateral loss</small>
            </article>
            <article>
              <span>Premiums collected</span>
              <strong>${fmt(result.totalPremium)}m</strong>
              <small>before programme costs</small>
            </article>
          </div>

          <section className="panel chartPanel">
            <div className="panelTitle">
              <span>Reserve path</span>
              <span className="legend">
                <i /> closing reserve <em /> crisis
              </span>
            </div>
            <div className="chart">
              {result.rows.map((r) => (
                <div className="barCol" key={r.year}>
                  <div
                    className={`bar ${r.isCrisis ? "crisis" : ""}`}
                    style={{ height: `${Math.max(2, (r.reserve / maxBar) * 100)}%` }}
                  >
                    <span>${fmt(r.reserve)}m</span>
                  </div>
                  <b>Y{r.year}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="split">
            <article className="panel waterfall">
              <div className="panelTitle">
                <span>Loan-level loss allocation · all 10 years</span>
              </div>
              <div className="wfRow">
                <span>Bank first-loss</span>
                <b>${fmt(result.totalBankFirstLoss)}m</b>
                <i style={{ width: `${(result.totalBankFirstLoss / lossTotal) * 100}%` }} />
              </div>
              <div className="wfRow">
                <span>National insurer claims</span>
                <b>${fmt(result.totalInsurerClaims)}m</b>
                <i style={{ width: `${(result.totalInsurerClaims / lossTotal) * 100}%` }} />
              </div>
              <div className="wfRow">
                <span>Bank excess loss</span>
                <b>${fmt(result.totalBankExcessLoss)}m</b>
                <i style={{ width: `${(result.totalBankExcessLoss / lossTotal) * 100}%` }} />
              </div>
              <div className="wfRow crown">
                <span>Aggregate reinsurance recovery</span>
                <b>${fmt(result.totalReinsurance)}m</b>
                <i style={{ width: `${Math.min(100, (result.totalReinsurance / Math.max(1, result.totalInsurerClaims)) * 100)}%` }} />
              </div>
            </article>

            <article className="panel verdict">
              <div className="panelTitle">
                <span>Kill-test comparator</span>
              </div>
              <strong>
                {currentSystemFailsHigherCapital
                  ? "The shock exceeds the higher-capital buffer."
                  : "Higher bank capital absorbs this shock in the comparator."}
              </strong>
              <p>
                Current-system peak bank hit is ${fmt(result.currentSystemPeakBankHit)}m versus a
                placeholder higher-capital buffer of ${fmt(result.higherCapitalBuffer)}m. This is
                the benchmark the insurance design has to beat.
              </p>
              <div className="tag">SCENARIO, NOT FORECAST</div>
            </article>
          </section>

          <section className="panel tablePanel">
            <div className="panelTitle">
              <span>Annual ledger · NZD millions</span>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Pool $bn</th>
                    <th>Premium</th>
                    <th>Gross claims</th>
                    <th>Reinsurance</th>
                    <th>Bank excess</th>
                    <th>Crown debt</th>
                    <th>Reserve</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.year} className={r.isCrisis ? "crisisRow" : ""}>
                      <td>
                        Y{r.year}
                        {r.isCrisis && " · CRISIS"}
                      </td>
                      <td>{fmt(r.pool, 1)}</td>
                      <td>{fmt(r.premium, 1)}</td>
                      <td>{fmt(r.insurerGrossClaims, 1)}</td>
                      <td>{fmt(r.reinsurance, 1)}</td>
                      <td>{fmt(r.bankExcessLoss, 1)}</td>
                      <td>{fmt(r.crownDebt, 1)}</td>
                      <td>
                        <b>{fmt(r.reserve, 1)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <section className="sources">
        <div>
          <p className="eyebrow">DATA LAYER</p>
          <h2>
            Official data where available.
            <br />
            Assumptions where it is not.
          </h2>
        </div>
        <div className="sourceGrid">
          <a href="https://www.rbnz.govt.nz/statistics/" target="_blank">
            <b>RBNZ Statistics</b>
            <span>Mortgage stock, lending, rates, bank and insurer balance sheets</span>
          </a>
          <a href="https://portal.apis.stats.govt.nz/" target="_blank">
            <b>Stats NZ API</b>
            <span>Employment, population, construction, prices and national accounts</span>
          </a>
          <a href="https://www.treasury.govt.nz/publications/budgets/forecasts" target="_blank">
            <b>Treasury forecasts</b>
            <span>Fiscal baseline, debt, unemployment and economic scenarios</span>
          </a>
          <div>
            <b>Model assumptions</b>
            <span>Premiums, PD/LGD, loss layers and reinsurance pricing remain user-controlled until independently calibrated</span>
          </div>
        </div>
      </section>

      <footer>
        <span>NZ Economic Stress Lab</span>
        <p>Built to test a hypothesis—not to sell a conclusion.</p>
      </footer>
    </main>
  );
}
