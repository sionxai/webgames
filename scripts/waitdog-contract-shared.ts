type ContractAssert = (
  condition: unknown,
  message: string,
) => asserts condition;

export const createContractAssert = (
  onAssertion: () => void,
): ContractAssert => (condition, message) => {
  if (!condition) {
    throw new Error(`CONTRACT FAIL: ${message}`);
  }
  onAssertion();
};

export const closeEnough = (
  first: number,
  second: number,
  tolerance = 1e-9,
): boolean => Math.abs(first - second) <= tolerance;
