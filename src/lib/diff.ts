export function createDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const diff: string[] = [];

  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i >= oldLines.length) {
      diff.push(`+ ${newLines[j]}`);
      j++;
    } else if (j >= newLines.length) {
      diff.push(`- ${oldLines[i]}`);
      i++;
    } else if (oldLines[i] === newLines[j]) {
      diff.push(`  ${oldLines[i]}`);
      i++;
      j++;
    } else {
      diff.push(`- ${oldLines[i]}`);
      diff.push(`+ ${newLines[j]}`);
      i++;
      j++;
    }
  }

  return diff.join("\n");
}
