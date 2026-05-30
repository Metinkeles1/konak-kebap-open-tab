// Tarihleri Türkçe ve kısa biçimde gösterir.
const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: Date | string): string {
  return dateFmt.format(new Date(value));
}

// Alış tarihi gibi dakikasına kadar gösterilmesi gereken yerler için.
export function formatDateTime(value: Date | string): string {
  return dateTimeFmt.format(new Date(value));
}
