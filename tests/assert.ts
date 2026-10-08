export function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(message ?? `Expected ${expectedJson}, received ${actualJson}`);
  }
}

export function assertMatch(actual: string, expected: RegExp): void {
  if (!expected.test(actual)) {
    throw new Error(`Expected ${JSON.stringify(actual)} to match ${expected}`);
  }
}

export async function assertRejects(
  action: () => Promise<unknown> | unknown,
  expected?: RegExp,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (expected && !expected.test(message)) {
      throw new Error(`Expected rejection matching ${expected}, received ${message}`);
    }
    return;
  }
  throw new Error("Expected action to reject");
}
