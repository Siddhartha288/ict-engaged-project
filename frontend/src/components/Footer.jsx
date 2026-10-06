import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-border/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:px-6">
        <p>BizTransform — a student prototype for ICT313. Not a commercial service.</p>
        <Link to="/privacy" className="text-teal hover:underline">
          Privacy notice
        </Link>
      </div>
    </footer>
  );
}
