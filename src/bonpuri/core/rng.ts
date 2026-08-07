export type Rng = () => number;

export type ShuffleResult<T> = {
  items: T[];
  rngCalls: number;
};

export function shuffle<T>(items: readonly T[], rng: Rng): ShuffleResult<T> {
  const shuffled = [...items];
  let rngCalls = 0;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(rng() * (index + 1));
    rngCalls += 1;
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return { items: shuffled, rngCalls };
}
