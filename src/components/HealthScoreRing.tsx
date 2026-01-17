interface Props {
  score: number;
  status: 'attention' | 'watch' | 'healthy';
  size?: 'sm' | 'md' | 'lg';
}

export default function HealthScoreRing({ score, status, size = 'md' }: Props) {
  const sizes = {
    sm: { ring: 48, stroke: 4, text: 'text-lg' },
    md: { ring: 64, stroke: 5, text: 'text-2xl' },
    lg: { ring: 80, stroke: 6, text: 'text-3xl' }
  };

  const colors = {
    attention: { stroke: '#ef4444', bg: '#fee2e2' },
    watch: { stroke: '#f59e0b', bg: '#fef3c7' },
    healthy: { stroke: '#22c55e', bg: '#dcfce7' }
  };

  const { ring, stroke, text } = sizes[size];
  const { stroke: strokeColor, bg } = colors[status];

  const radius = (ring - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: ring, height: ring }}>
      <svg className="transform -rotate-90" width={ring} height={ring}>
        {/* Background circle */}
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={radius}
          fill="none"
          stroke={bg}
          strokeWidth={stroke}
        />
        {/* Progress circle */}
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-bold ${text}`} style={{ color: strokeColor }}>
          {score}
        </span>
      </div>
    </div>
  );
}
