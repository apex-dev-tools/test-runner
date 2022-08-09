/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

export function chunk<A>(xs: Array<A>, chunkSize: number): A[][] {
  const accum = [];
  for (let i = 0; i < xs.length; i += chunkSize)
    accum.push(xs.slice(i, i + chunkSize));
  return accum;
}
