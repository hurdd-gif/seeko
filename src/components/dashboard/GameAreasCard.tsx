import type { Area } from '@/lib/types';

export function GameAreasCard({ areas }: { areas: Area[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-400 mb-4">Game Areas</h3>
      {areas.length === 0 ? (
        <p className="text-sm text-zinc-600">No areas</p>
      ) : (
        <ul className="space-y-4">
          {areas.map((area) => (
            <li key={area.id}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-zinc-200">{area.name}</span>
                <span className="text-xs font-mono text-zinc-400">{area.progress}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${area.progress}%`,
                    backgroundColor: '#6ee7b7',
                  }}
                />
              </div>
              {area.phase && (
                <p className="text-xs text-zinc-600 mt-1">{area.phase}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
