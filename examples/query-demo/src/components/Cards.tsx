import { styles } from "../styles"

export function Card({
  title,
  value,
  loading,
}: {
  title: string
  value?: string
  loading?: boolean
}) {
  return (
    <div style={styles.card}>
      <h3 style={styles.cardTitle}>{title}</h3>
      <p style={{ ...styles.cardValue, opacity: loading ? 0.5 : 1 }}>
        {loading ? "Loading..." : value}
      </p>
    </div>
  )
}

export function BalanceCard({
  token,
  balance,
  color,
  loading,
}: {
  token: string
  balance: string
  color: string
  loading?: boolean
}) {
  return (
    <div style={{ ...styles.balanceCard, borderColor: color }}>
      <span style={{ ...styles.tokenLabel, color }}>{token}</span>
      <span style={{ ...styles.balanceValue, opacity: loading ? 0.5 : 1 }}>
        {balance}
      </span>
    </div>
  )
}
