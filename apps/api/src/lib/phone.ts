const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

export function normalizeIndianPhoneNumber(phone: string): string | null {
  const digitsOnly = phone.replace(/\D/g, "");
  const normalized = digitsOnly.startsWith("91") && digitsOnly.length === 12
    ? digitsOnly.slice(2)
    : digitsOnly;

  return INDIAN_PHONE_REGEX.test(normalized) ? normalized : null;
}
