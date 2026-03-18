import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface ReportSparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

export function ReportSparkline({
  data,
  color = "hsl(var(--primary))",
  height = 32,
}: ReportSparklineProps) {
  if (!data || data.length === 0) {
    return <div style={{ height }} />;
  }

  const chartData = data.map((value, index) => ({ index, value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sparkGrad-${color.replace(/[^a-zA-Z0-9]/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sparkGrad-${color.replace(/[^a-zA-Z0-9]/g, "")})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
