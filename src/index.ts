#!/usr/bin/env node
import glob from "fast-glob";
import fs from "fs";
import path from "path";
import Yargs from "yargs";
import { promisify } from "util";
import { version } from "../package.json";
import { assertIsString, assert } from "assertate";

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
    let readFile = promisify(fs.readFile);
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

type Filepath = string;
type Base64String = Filepath;
type FileEntry = [Filepath, Base64String];
type FileSystem = FileEntry[];

/**
 * Serializes all files found by globbing the `globPattern` into a flat map of
 * {[filepath: string]: base64}
 *
 * @param globPattern glob pattern to find files to backup
 * @param filters additional lambda filters you may wish to provide
 */
async function Base64Filesystem<T>(
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

    return files.map(({ filepath, contents }) => [filepath, contents]);
  } catch (err) {
    console.error(`error occurred creating backup file map`);
    throw wrapError(err);
  }
}

////////////////////////////////////////////////////////////////////////////////
// main
////////////////////////////////////////////////////////////////////////////////
Yargs.scriptName("back64up")
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
        .option("format", {
          describe: "Format to output",
          type: "string",
          choices: ["json", "csv", "tsv"],
          default: "json"
        })
        .option("verbose", {
          alias: "v",
          type: "boolean",
          description: "Run with verbose logging"
        });
    },
    async (argv): Promise<undefined> => {
      let { pattern, outFile, format } = argv;
      assertIsString(pattern);
      assertIsString(outFile);
      assert(format === "json" || format === "csv" || format === "tsv");
      console.info(
        `backing up all files in '${process.cwd()}' matching '${pattern}' to path '${outFile}' in format '${format}'...`
      );
      // warn about extension/format
      if (!outFile.endsWith("." + format)) {
        console.warn(
          `warning: the chosen --out-file '${outFile}' extension does not match the chosen --format '${format}'`
        );
      }
      console.info(
        `Finding and encoding files matching the pattern ${pattern} in directory ${process.cwd()}`
      );
      try {
        let fileMap = await Base64Filesystem(pattern, []);
        console.info(
          `Found and encoded ${Object.keys(fileMap).length} file(s)`
        );
        let absOut = path.resolve(outFile);

        // format the output
        let content: string | undefined = undefined;
        if (format === "json") {
          //  reduce the list into a filesystem map
          let files = fileMap.reduce<{ [filepath: string]: string }>(
            (reduction, [filepath, content]) => {
              reduction[filepath] = content;
              return reduction;
            },
            {}
          );
          content = JSON.stringify(files);
        } else if (format === "csv") {
          content = [
            "filepath,content",
            ...fileMap.map(entry => {
              // escape filenames
              entry[0] = entry[0].replace(/,/g, "\\,");
              return entry.join(",");
            })
          ].join("\n");
        } else if (format == "tsv") {
          content = [
            "filepath\tcontent",
            ...fileMap.map(entry => {
              // tabs are never in filenames
              return entry.join("\t");
            })
          ].join("\n");
        } else {
          throw Error(
            `invalid --format '${format}' provided -- must be one of ${JSON.stringify(
              ["json", "csv", "tsv"]
            )}`
          );
        }

        // Write out the file
        console.info(`Beginning file write to ${absOut}`);
        await promisify(fs.writeFile)(absOut, content, "utf8").catch(err => {
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
