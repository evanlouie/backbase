import glob from "fast-glob";
import fs from "fs";
import path from "path";
import Yargs from "yargs";
import util from "util";
import { version } from "../package.json";
import { assertIsString } from "assertate";

type Coder<T> = {
  decode: Decode<T>;
  encode: Encode<T>;
};
type Decode<T> = (value: T) => Promise<Buffer>;
type Encode<T> = (filepath: string) => Promise<T>;

let Base64: Coder<string> = {
  decode: async base64 => {
    let buffer = Buffer.from(base64, "base64");
    return buffer;
  },
  encode: async filepath => {
    let readFile = util.promisify(fs.readFile);
    let base64 = readFile(filepath, "base64");
    return base64;
  }
};

/**
 * Wraps the given `value` as an Error -- if it already was an instance of
 * Error, it returns it without modification
 *
 * @param value value to ensure is returned as an Error
 */
function wrapError(value: any): Error {
  return value instanceof Error ? value : Error(value);
}

type Base64String = string;
type FileSystem = { [filepath: string]: Base64String };

/**
 * Serializes all files found by globbing the `globPattern` into a flat map of
 * {[filepath: string]: base64}
 *
 * @param globPattern glob pattern to find files to backup
 * @param filters additional lambda filters you may wish to provide
 */
export async function Base64Filesystem<T>(
  globPattern: string,
  filters: Array<(value: string) => boolean> = []
): Promise<FileSystem> {
  try {
    // read glob
    let fileGlob = await glob(globPattern).catch(err => {
      console.error(
        `error occurred executing glob pattern '${globPattern}' on directory ${process.cwd()}`
      );
      throw wrapError(fileGlob);
    });

    // map all provided filters
    let filtered = filters.reduce((values, filter) => {
      return values.filter(filter);
    }, fileGlob);

    // read/encode all files into memory map
    let fileReads = filtered.map(async filepath => {
      let contents = await Base64.encode(filepath);
      console.info(`encoded: ${filepath}`);
      return {
        contents,
        filepath
      };
    });
    let files = await Promise.all(fileReads).catch(err => {
      console.error(`encountered error reading and encoding files`);
      throw wrapError(err);
    });

    // reduce the list into a filesystem map
    let fileMap = files.reduce<FileSystem>((reduction, file) => {
      reduction[file.filepath] = file.contents;
      return reduction;
    }, {});

    return fileMap;
  } catch (err) {
    console.error(`error occurred creating backup file map`);
    throw wrapError(err);
  }
}

////////////////////////////////////////////////////////////////////////////////
// main
////////////////////////////////////////////////////////////////////////////////
Yargs.scriptName("backbase")
  .version(version)
  .usage("$0 <cmd> [args]")
  .command(
    "backup <pattern> [out-file]",
    "backup all files matching the given pattern",
    yargs => {
      yargs
        .positional("pattern", {
          describe:
            "The glob pattern to match files against -- wrap with quotes to prevent glob from shell",
          type: "string"
        })
        .positional("out-file", {
          describe: "Output path for backup",
          type: "string",
          default: "./backup.json"
        })
        .option("verbose", {
          alias: "v",
          type: "boolean",
          description: "Run with verbose logging"
        });
    },
    async (argv): Promise<undefined> => {
      let { pattern, outFile } = argv;
      assertIsString(pattern);
      assertIsString(outFile);
      console.info(
        `Finding and encoding files matching the pattern ${pattern} in directory ${process.cwd()}`
      );
      try {
        let fileMap = await Base64Filesystem(pattern);
        console.info(
          `Found and encoded ${Object.keys(fileMap).length} file(s)`
        );
        let absOut = path.resolve(outFile);

        // Write out the file
        console.info(`Beginning file write to ${absOut}`);
        await util
          .promisify(fs.writeFile)(absOut, JSON.stringify(fileMap), "utf8")
          .catch(err => {
            console.error(
              `error occurred while attempting to write file to ${absOut}`
            );
            throw wrapError(err);
          });
        console.info(`Successfully wrote backup to ${absOut}`);

        return undefined;
      } catch (err) {
        console.error(`encountered an error during backup`);
        console.error(err);
        process.exit(1);
      }
    }
  )
  .demandCommand().argv;
