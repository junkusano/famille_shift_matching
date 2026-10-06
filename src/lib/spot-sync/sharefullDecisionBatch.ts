export function sharefullDecisionBatch(totalRows: number, slotNumber: number, batchSize = 30) {
  if (!Number.isSafeInteger(totalRows) || totalRows < 0) {
    throw new Error("totalRows must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(slotNumber) || slotNumber < 0) {
    throw new Error("slotNumber must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error("batchSize must be a positive safe integer");
  }

  const batchCount = Math.max(1, Math.ceil(totalRows / batchSize));
  const batchIndex = slotNumber % batchCount;
  const from = batchIndex * batchSize;
  return { batchCount, batchIndex, from, to: from + batchSize - 1 };
}
