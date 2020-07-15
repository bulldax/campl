import { expect } from 'chai';

export async function assertFailure (_promise: any) {
  try {
    await _promise;
  } catch (error) {
    return error;
  }
  expect.fail();
}
