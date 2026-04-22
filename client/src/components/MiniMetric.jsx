export default function MiniMetric({ label, value }) {
  return (
    <div className="bg-gray-800 p-3 rounded-lg">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
