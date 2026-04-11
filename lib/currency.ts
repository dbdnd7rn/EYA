export function kwacha(value: number) {
  return `K${Number(value || 0).toLocaleString("en-MW")}`;
}

