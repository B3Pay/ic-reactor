import { icdvNameQuery } from "../reactor"

export const ICDVName = () => {
  const { data, isLoading, refetch } = icdvNameQuery.useQuery()

  return (
    <div className="token-card icdv">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <span style={{ fontSize: "1.5rem" }}>💜</span>
        <button
          className="btn-icon"
          onClick={() => refetch()}
          disabled={isLoading}
          title="Refresh"
        >
          ↻
        </button>
      </div>
      <div className="token-name icdv">
        {isLoading ? <span className="spinner" /> : data || "ICDV Token"}
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
        IC Developer Token
      </p>
    </div>
  )
}
