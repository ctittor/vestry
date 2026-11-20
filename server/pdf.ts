import {
  mkdtemp,
  writeFile,
  readdir,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
export async function rasterisePdf(original: Buffer): Promise<Buffer[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "vestry-pdf-"));
  try {
    const input = path.join(dir, "source.pdf");
    await writeFile(input, original, { mode: 0o600 });
    const { stdout } = await run("pdfinfo", [input], {
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    });
    const count = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]);
    if (!Number.isInteger(count) || count < 1 || count > 200)
      throw new Error("PDF must contain 1–200 pages.");
    await run(
      "pdftoppm",
      [
        "-f",
        "1",
        "-l",
        String(count),
        "-scale-to",
        "2200",
        "-png",
        input,
        path.join(dir, "page"),
      ],
      { timeout: 180000, maxBuffer: 1024 * 1024 },
    );
    const files = (await readdir(dir))
      .filter((f) => /^page-\d+\.png$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    if (files.length !== count) throw new Error("PDF page count mismatch.");
    const sizes = await Promise.all(files.map((f) => stat(path.join(dir, f))));
    if (sizes.reduce((sum, s) => sum + s.size, 0) > 100 * 1024 * 1024)
      throw new Error("PDF working pages exceed the 100 MB processing limit.");
    return Promise.all(files.map((file) => readFile(path.join(dir, file))));
  } finally {
    const resolved = path.resolve(dir);
    if (
      path.dirname(resolved) === path.resolve(tmpdir()) &&
      path.basename(resolved).startsWith("vestry-pdf-")
    )
      await rm(resolved, { recursive: true, force: true });
  }
}
