/** Honest failure state — mirrors the backend's honest-503 pattern. When
 *  the live API is unreachable we say so; we never show stand-in numbers. */
export default function ApiErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card elev-sm">
      <div className="card-title" style={{ fontSize: 15 }}>הנתונים החיים אינם זמינים כרגע</div>
      <p className="card-body">
        לא הצלחנו לקבל נתונים ממנוע האותות. כדי לא להטעות, לא נציג נתונים חלופיים או משוערים —
        נסי לרענן בעוד רגע.
      </p>
      <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={onRetry}>
        נסה שוב
      </button>
    </div>
  );
}
