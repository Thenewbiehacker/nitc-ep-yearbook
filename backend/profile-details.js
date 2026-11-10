export function validBirthday(value) {
  if (
    typeof value !== "string" ||
    !/^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4}$/.test(value)
  ) return false;
  const [day, month, year] = value.split("-").map(Number);
  const date = new Date(
    `${value.slice(6)}-${value.slice(3, 5)}-${value.slice(0, 2)}T00:00:00Z`,
  );
  return year > 0 && date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day &&
    date <= new Date();
}

const editable = ["name", "initials", "quote", "property", "birthday"];

export function validateProfileEdit(current, body) {
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    !Object.keys(body).length ||
    Object.entries(body).some(([key, value]) =>
      !editable.includes(key) || typeof value !== "string")
  ) return { error: "Only name, initials, quote, description, and birthday can be edited." };

  const details = { ...current };
  for (const [key, value] of Object.entries(body)) details[key] = value.trim();
  if (
    details.name.length < 2 || details.name.length > 80 ||
    !details.quote.length || details.quote.length > 240 ||
    !details.property.length || details.property.length > 60 ||
    details.initials.length > 4
  ) return { error: "Enter a name (2–80 characters), a quote (up to 240), a description (up to 60), and initials of up to 4 characters." };

  // Keep old month/day-only birthdays when correcting other details.
  if (details.birthday !== current.birthday && !validBirthday(details.birthday))
    return { error: "Enter a valid birthday in DD-MM-YYYY format that is not in the future." };

  if (!details.initials)
    details.initials = details.name.split(/\s+/).slice(0, 2)
      .map(word => Array.from(word)[0]).join("");
  return { details };
}
