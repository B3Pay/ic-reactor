import { icpNameQuery } from "../reactor"

export const ICPName = () => {
  const { data, isLoading, refetch } = icpNameQuery.useQuery()

  return (
    <div className="token-card icp">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <span style={{ fontSize: "1.5rem" }}>🔷</span>
        <button
          className="btn-icon"
          onClick={() => refetch()}
          disabled={isLoading}
          title="Refresh"
        >
          ↻
        </button>
      </div>
      <div className="token-name icp">
        {isLoading ? <span className="spinner" /> : data || "ICP Ledger"}
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
        Internet Computer Protocol
      </p>
    </div>
  )
}
