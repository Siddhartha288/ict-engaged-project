import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-teal">404</p>
      <h1 className="mb-2 font-display text-3xl font-bold">Page not found</h1>
      <p className="mb-6 text-sm text-muted">That page doesn&apos;t exist, or the link has changed.</p>
      <Link
        to="/"
        className="rounded-xl bg-amber px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-amber/90"
      >
        Back to the home page
      </Link>
    </div>
  );
}
