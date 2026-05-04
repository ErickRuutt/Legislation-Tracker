interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}

export function StatCard({ label, value, sub, color = 'blue' }: StatCardProps) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500 bg-blue-50',
    green: 'border-green-500 bg-green-50',
    amber: 'border-amber-500 bg-amber-50',
    red: 'border-red-500 bg-red-50',
    purple: 'border-purple-500 bg-purple-50',
    slate: 'border-slate-500 bg-slate-50',
  };

  return (
    <div className={`border-l-4 ${colorMap[color] || colorMap.blue} rounded-lg p-4 shadow-sm`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
