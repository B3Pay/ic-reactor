// Stat Box Component
interface StatBoxProps {
  value: string
  label: string
  color: string
}

export const StatBox = ({ value, label, color }: StatBoxProps) => (
  <div
    style={{
      textAlign: "center",
      padding: "12px",
      background: "var(--bg-primary)",
      borderRadius: "8px",
    }}
  >
    <div style={{ fontSize: "1.5rem", fontWeight: "700", color }}>{value}</div>
    <div
      style={{
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        marginTop: "4px",
      }}
    >
      {label}
    </div>
  </div>
)
