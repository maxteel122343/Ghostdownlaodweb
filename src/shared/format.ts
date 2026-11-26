export function toReadableSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0.00 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

export function toReadableTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "--";
  }
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function toEtaText(fileSize: number, receivedBytes: number, speed: number): string {
  if (fileSize > 0 && speed > 0 && receivedBytes < fileSize) {
    return toReadableTime((fileSize - receivedBytes) / speed);
  }
  return "--";
}
