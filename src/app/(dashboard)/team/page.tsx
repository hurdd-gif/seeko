import { fetchTeam } from '@/lib/notion';

const DEPT_COLORS: Record<string, string> = {
  Coding: '#6ee7b7',
  'Visual Art': '#93c5fd',
  'UI/UX': '#c4b5fd',
  Animation: '#fbbf24',
  'Asset Creation': '#f9a8d4',
};

export default async function TeamPage() {
  const team = await fetchTeam().catch(() => []);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Team</h1>
        <p className="text-sm text-zinc-500 mt-1">{team.length} members</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {team.map((member) => (
          <div
            key={member.id}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-3"
          >
            <div
              className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-sm font-bold text-black"
              style={{ backgroundColor: DEPT_COLORS[member.department] ?? '#6b7280' }}
            >
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-white text-sm truncate">{member.name}</p>
              <p className="text-xs text-zinc-400 truncate">{member.role}</p>
              <span
                className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: (DEPT_COLORS[member.department] ?? '#6b7280') + '20',
                  color: DEPT_COLORS[member.department] ?? '#6b7280',
                }}
              >
                {member.department}
              </span>
            </div>
          </div>
        ))}

        {team.length === 0 && (
          <div className="col-span-3 text-center py-12 text-zinc-600 text-sm">
            No team members found. Add them to the Notion Team database.
          </div>
        )}
      </div>
    </>
  );
}
