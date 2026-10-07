import { Sparkles, ListChecks } from 'lucide-react';

const LABELS = {
  gemini: { text: 'Written by Gemini AI from your answers', ai: true },
  claude: { text: 'Written by Claude AI from your answers', ai: true },
  rules: { text: 'Built from your answers with built-in rules (no AI)', ai: false },
};

// Says which engine wrote a roadmap. Roadmaps saved before this existed have no
// source recorded, so nothing is shown for them.
export default function RoadmapSource({ source }) {
  const info = LABELS[source];
  if (!info) return null;
  const Icon = info.ai ? Sparkles : ListChecks;
  return (
    <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted/80">
      <Icon size={12} className={info.ai ? 'text-amber' : ''} /> {info.text}
    </p>
  );
}
