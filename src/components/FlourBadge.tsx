export default function FlourBadge({ percent, hasItems }: { percent: number; hasItems: boolean }) {
  if (!hasItems) return null
  const ok = Math.abs(percent - 100) < 0.01
  return (
    <span className={`badge ${ok ? 'ok' : 'warn'}`}>
      Flour {percent.toLocaleString(undefined, { maximumFractionDigits: 2 })}%{ok ? '' : ' (should be 100%)'}
    </span>
  )
}
