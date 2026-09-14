export type Pose = 'wave' | 'hyped' | 'sleepy' | 'cheer' | 'wince' | 'rest' | 'think'

/** Placeholder otter until the real Ottie art lands. Same silhouette, different faces. */
export function Ottie({ pose = 'wave', size = 72 }: { pose?: Pose; size?: number }) {
  const eyes =
    pose === 'sleepy' ? (
      <>
        <path d="M22 31 q4 3 8 0" stroke="#111" strokeWidth={2.2} fill="none" strokeLinecap="round" />
        <path d="M36 31 q4 3 8 0" stroke="#111" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      </>
    ) : pose === 'wince' ? (
      <>
        <path d="M22 29 l8 4 M30 29 l-8 4" stroke="#111" strokeWidth={2} strokeLinecap="round" />
        <path d="M36 29 l8 4 M44 29 l-8 4" stroke="#111" strokeWidth={2} strokeLinecap="round" />
      </>
    ) : pose === 'cheer' || pose === 'hyped' ? (
      <>
        <path d="M22 32 q4 -5 8 0" stroke="#111" strokeWidth={2.4} fill="none" strokeLinecap="round" />
        <path d="M36 32 q4 -5 8 0" stroke="#111" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx={26} cy={31} r={3} fill="#111" />
        <circle cx={40} cy={31} r={3} fill="#111" />
        <circle cx={27} cy={30} r={1} fill="#fff" />
        <circle cx={41} cy={30} r={1} fill="#fff" />
      </>
    )
  const mouth =
    pose === 'wince' ? (
      <path d="M29 42 q4 -3 8 0" stroke="#111" strokeWidth={2} fill="none" strokeLinecap="round" />
    ) : pose === 'sleepy' ? (
      <ellipse cx={33} cy={42} rx={2} ry={2.6} fill="#111" />
    ) : pose === 'think' ? (
      <path d="M30 42 h6" stroke="#111" strokeWidth={2} strokeLinecap="round" />
    ) : (
      <path d="M28 40 q5 5 10 0" stroke="#111" strokeWidth={2} fill="none" strokeLinecap="round" />
    )
  return (
    <svg width={size} height={size} viewBox="0 0 66 66" aria-hidden="true" className={`ottie ottie-${pose}`}>
      {/* body */}
      <ellipse cx={33} cy={54} rx={20} ry={11} fill="#7a4b22" />
      <ellipse cx={33} cy={56} rx={12} ry={7} fill="#d9b382" />
      {/* arms */}
      {pose === 'wave' || pose === 'cheer' || pose === 'hyped' ? (
        <>
          <path d="M14 50 q-6 -10 2 -18" stroke="#7a4b22" strokeWidth={6} strokeLinecap="round" fill="none" className="ottie-arm" />
          {pose !== 'wave' && <path d="M52 50 q6 -10 -2 -18" stroke="#7a4b22" strokeWidth={6} strokeLinecap="round" fill="none" className="ottie-arm-r" />}
        </>
      ) : (
        <>
          <path d="M16 52 q-6 4 -2 8" stroke="#7a4b22" strokeWidth={6} strokeLinecap="round" fill="none" />
          <path d="M50 52 q6 4 2 8" stroke="#7a4b22" strokeWidth={6} strokeLinecap="round" fill="none" />
        </>
      )}
      {/* head */}
      <ellipse cx={33} cy={32} rx={19} ry={17} fill="#8b5a2b" />
      <circle cx={16} cy={20} r={5} fill="#8b5a2b" />
      <circle cx={50} cy={20} r={5} fill="#8b5a2b" />
      <circle cx={16} cy={20} r={2.5} fill="#d9b382" />
      <circle cx={50} cy={20} r={2.5} fill="#d9b382" />
      <ellipse cx={33} cy={40} rx={11} ry={8} fill="#d9b382" />
      <ellipse cx={33} cy={36} rx={4} ry={2.6} fill="#2b1a0e" />
      {eyes}
      {mouth}
      {/* whiskers */}
      <path d="M20 38 h-8 M20 40 h-8 M46 38 h8 M46 40 h8" stroke="#3b2a1a" strokeWidth={1} strokeLinecap="round" />
      {pose === 'sleepy' && (
        <text x={50} y={12} fontSize={9} fontWeight={700} fill="#94a3b8" className="ottie-zzz">
          z z
        </text>
      )}
      {pose === 'rest' && <path d="M8 60 h50" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" opacity={0.5} />}
    </svg>
  )
}
