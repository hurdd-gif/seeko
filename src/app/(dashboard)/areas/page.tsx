import { fetchAreas } from '@/lib/notion';
import { GameAreasCard } from '@/components/dashboard/GameAreasCard';

export default async function AreasPage() {
  const areas = await fetchAreas().catch(() => []);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Game Areas</h1>
        <p className="text-sm text-zinc-500 mt-1">Dojo · Battleground · Fighting Club</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {areas.map((area) => (
          <div key={area.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white">{area.name}</h2>
              {area.phase && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                  {area.phase}
                </span>
              )}
            </div>
            {area.description && (
              <p className="text-sm text-zinc-400 mb-4">{area.description}</p>
            )}
            <div>
              <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                <span>Progress</span>
                <span className="font-mono">{area.progress}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${area.progress}%`, backgroundColor: '#6ee7b7' }}
                />
              </div>
            </div>
          </div>
        ))}

        {areas.length === 0 && (
          <div className="col-span-3 text-center py-12 text-zinc-600 text-sm">
            No game areas found. Add them to the Notion Areas database.
          </div>
        )}
      </div>
    </>
  );
}
