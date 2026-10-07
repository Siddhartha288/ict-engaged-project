import { useEffect, useState } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';

// On phones the long category names ("Digital Payments") run off the edge and
// widen the whole page, so use short labels and a smaller chart there.
const SHORT_LABELS = {
  'Online Presence': 'Online',
  'Digital Payments': 'Payments',
};
const NARROW_BELOW_PX = 520;

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_BELOW_PX);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < NARROW_BELOW_PX);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return narrow;
}

export default function RadarScoreChart({ categories = [] }) {
  const narrow = useIsNarrow();
  const data = categories.map((c) => ({
    category: narrow ? SHORT_LABELS[c.label] || c.label : c.label,
    score: c.score,
    fullMark: 100,
  }));

  return (
    <div className="h-80 w-full overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius={narrow ? '62%' : '70%'} data={data}>
          <PolarGrid stroke="#2A2A42" />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: '#9C9BB3', fontSize: narrow ? 10 : 11, fontFamily: 'IBM Plex Mono' }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tick={{ fill: '#9C9BB3', fontSize: 10 }}
            axisLine={false}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#4FD1C5"
            fill="#4FD1C5"
            fillOpacity={0.35}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
