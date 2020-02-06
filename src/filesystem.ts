import Base64 from "./base64";
import glob from "fast-glob";
import { wrapError } from "./error-handling";

type Filepath = string;
type Base64String = Filepath;
type FileEntry = [Filepath, Base64String];
type FileSystem = {
  files: readonly FileEntry[];
  asCSV: () => string;
  asTSV: () => string;
  asJSON: () => string;
  toMap: () => { [filepath: string]: Base64String };
};

/**
 * Serializes the given filesystem into a CSV string
 *
 * @param filesystem filesystem to serialize to CSV
 */
function asCSV(filesystem: FileEntry[]): string {
  return [
    "filepath,content",
    ...filesystem.map((entry) => {
      // escape filenames
      entry[0] = entry[0].replace(/,/g, "\\,");
      return entry.join(",");
    }),
  ].join("\n");
}

/**
 * Serializes the given filesystem into a TSV string
 *
 * @param filesystem filesystem to serialize to TSV
 */
function asTSV(filesystem: FileEntry[]): string {
  return [
    "filepath\tcontent",
    ...filesystem.map((entry) => {
      // tabs are never in filenames
      return entry.join("\t");
    }),
  ].join("\n");
}

/**
 * Wraps the given FileEntry[] into a FileSystem object
 *
 * @param files files to turn to a FileSystem
 */
function FileSystem(files: FileEntry[]): FileSystem {
  return {
    files,
    asJSON: () => JSON.stringify(files),
    asCSV: () => asCSV(files),
    asTSV: () => asTSV(files),
    toMap: () =>
      files.reduce<{ [filepath: string]: string }>(
        (reduction, [filepath, content]) => {
          reduction[filepath] = content;
          return reduction;
        },
        {},
      ),
  };
}

/**
 * Serializes all files found by globbing the `globPattern` into a flat map of
 * {[filepath: string]: base64}
 *
 * @param globPattern glob pattern to find files to backup
 * @param filters additional lambda filters you may wish to provide
 */
export async function Base64Filesystem<T>(
  globPattern: string,
  filters: Array<(value: string) => boolean> = [],
): Promise<FileSystem> {
  try {
    // read glob
    let fileGlob = await glob(globPattern).catch((err) => {
      console.error(
        `error occurred executing glob pattern '${globPattern}' on directory ${process.cwd()}`,
      );
      throw wrapError(fileGlob);
    });

    // map all provided filters
    let filtered = filters.reduce((values, filter) => {
      return values.filter(filter);
    }, fileGlob);

    // read/encode all files into memory map
    let fileReads = filtered.map(async (filepath) => {
      let contents = await Base64.encode(filepath);
      console.info(`encoded: ${filepath}`);
      return {
        contents,
        filepath,
      };
    });
    let files = await Promise.all(fileReads).catch((err) => {
      console.error(`encountered error reading and encoding files`);
      throw wrapError(err);
    });

    return FileSystem(
      files.map(({ filepath, contents }) => [filepath, contents]),
    );
  } catch (err) {
    console.error(`error occurred creating backup file map`);
    throw wrapError(err);
  }
}
