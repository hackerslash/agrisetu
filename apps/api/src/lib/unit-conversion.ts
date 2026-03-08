const MASS_UNIT_TO_KG: Record<string, number> = {
  kg: 1,
  quintal: 100,
  ton: 1000,
};

function roundConvertedValue(value: number) {
  return Number.parseFloat(value.toFixed(6));
}

export function normalizeUnitValue(unit: string) {
  return unit.toLowerCase().trim();
}

export function getCompatibleUnits(unit: string) {
  const normalizedUnit = normalizeUnitValue(unit);
  if (normalizedUnit in MASS_UNIT_TO_KG) {
    return Object.keys(MASS_UNIT_TO_KG);
  }
  return [normalizedUnit];
}

export function areUnitsCompatible(fromUnit: string, toUnit: string) {
  const normalizedFromUnit = normalizeUnitValue(fromUnit);
  const normalizedToUnit = normalizeUnitValue(toUnit);

  if (normalizedFromUnit === normalizedToUnit) {
    return true;
  }

  return (
    normalizedFromUnit in MASS_UNIT_TO_KG &&
    normalizedToUnit in MASS_UNIT_TO_KG
  );
}

export function convertQuantityValue(
  quantity: number,
  fromUnit: string,
  toUnit: string,
) {
  const normalizedFromUnit = normalizeUnitValue(fromUnit);
  const normalizedToUnit = normalizeUnitValue(toUnit);

  if (normalizedFromUnit === normalizedToUnit) {
    return roundConvertedValue(quantity);
  }

  const fromFactor = MASS_UNIT_TO_KG[normalizedFromUnit];
  const toFactor = MASS_UNIT_TO_KG[normalizedToUnit];
  if (!fromFactor || !toFactor) {
    return null;
  }

  return roundConvertedValue((quantity * fromFactor) / toFactor);
}

export function convertPricePerUnitValue(
  pricePerUnit: number,
  fromUnit: string,
  toUnit: string,
) {
  const normalizedFromUnit = normalizeUnitValue(fromUnit);
  const normalizedToUnit = normalizeUnitValue(toUnit);

  if (normalizedFromUnit === normalizedToUnit) {
    return roundConvertedValue(pricePerUnit);
  }

  const fromFactor = MASS_UNIT_TO_KG[normalizedFromUnit];
  const toFactor = MASS_UNIT_TO_KG[normalizedToUnit];
  if (!fromFactor || !toFactor) {
    return null;
  }

  return roundConvertedValue((pricePerUnit * toFactor) / fromFactor);
}
