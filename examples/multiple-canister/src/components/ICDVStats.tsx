import { icdvStatsQuery } from "../reactor"
import { StatBox } from "./StatBox"

export const ICDVStats = () => {
  const { data: stats, isLoading, refetch } = icdvStatsQuery.useQuery()

  const formatSupply = (supply: bigint | undefined) => {
    if (supply === undefined) return "—"
    return (Number(supply) / 1e8).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">📊</span>
        <h3 className="card-title">ICDV Statistics</h3>
        <button
          className="btn-icon"
          onClick={() => refetch()}
          disabled={isLoading}
          title="Refresh"
          style={{ marginLeft: "auto" }}
        >
          ↻
        </button>
      </div>

      {isLoading ? (
        <div className="status status-loading">
          <span className="spinner" /> Loading stats...
        </div>
      ) : stats ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "16px",
          }}
        >
          <StatBox
            value={formatSupply(stats.totalSupply)}
            label="Total Supply"
            color="var(--color-primary)"
          />
          <StatBox
            value={stats.holders.toString()}
            label="Holders"
            color="var(--color-secondary)"
          />
          <StatBox
            value={formatSupply(stats.mintedEpoch)}
            label="Minted This Epoch"
            color="var(--color-success)"
          />
        </div>
      ) : null}
    </div>
  )
}
