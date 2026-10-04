// The SSR guide's `@/components/slow-section`: a Server Component of the app.
export async function SlowSection() {
  await Promise.resolve()
  return <p>Done.</p>
}
