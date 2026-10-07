// Honest caveats under a sector benchmark: small samples are only indicative,
// and demo data must never be mistaken for real market data.
export default function BenchmarkNote({ benchmark }) {
  if (!benchmark || benchmark.insufficient_data) return null;
  return (
    <div className="mt-3 space-y-1 text-[11px] text-muted/80">
      {benchmark.small_sample && (
        <p>
          Based on only {benchmark.sample_size} businesses — indicative, not a market average.
        </p>
      )}
      {benchmark.includes_demo && <p>Includes demo data, so this comparison is illustrative.</p>}
    </div>
  );
}
