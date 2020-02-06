#!/usr/bin/env node
import fs from "fs";
import path from "path";
import Yargs from "yargs";
import { promisify } from "util";
import { version } from "../package.json";
import { assertIsString, assert } from "assertate";
import { Base64Filesystem } from "./filesystem";
import { wrapError } from "./error-handling";

////////////////////////////////////////////////////////////////////////////////
// main
////////////////////////////////////////////////////////////////////////////////
let supportedFormats = <const>["json", "csv", "tsv"];

/**
 * Type-guard to ensure that the given format is a supported serialization type
 *
 * @param format format string to check if is a supported export format
 */
function isSupportedType<T = typeof supportedFormats[number]>(
  format: unknown,
): format is T {
  return (
    typeof format === "string" &&
    supportedFormats.filter((supported) => format === supported).length === 1
  );
}

Yargs.scriptName("back64up")
  .version(version)
  .usage("$0 <cmd> [args]")
  .command(
    "backup <pattern> [out-file]",
    "backup all files matching the given pattern",
    (yargs) => {
      yargs
        .positional("pattern", {
          describe:
            "The glob pattern to match files against -- wrap with quotes to prevent glob from shell",
          type: "string",
        })
        .positional("out-file", {
          describe: "Output path for backup",
          type: "string",
          default: "./backup.json",
        })
        .option("format", {
          describe: "Format to output",
          type: "string",
          choices: ["json", "csv", "tsv"],
          default: "json",
        })
        .option("verbose", {
          alias: "v",
          type: "boolean",
          description: "Run with verbose logging",
        });
    },
    async (argv): Promise<undefined> => {
      let { pattern, outFile, format } = argv;
      assertIsString(pattern);
      assertIsString(outFile);
      assert(isSupportedType(format));
      console.info(
        `backing up all files in '${process.cwd()}' matching '${pattern}' to path '${outFile}' in format '${format}'...`,
      );
      // warn about extension/format
      if (!outFile.endsWith("." + format)) {
        console.warn(
          `warning: the chosen --out-file '${outFile}' extension does not match the chosen --format '${format}'`,
        );
      }
      console.info(
        `Finding and encoding files matching the pattern ${pattern} in directory ${process.cwd()}`,
      );
      try {
        let filesystem = await Base64Filesystem(pattern, []);
        console.info(
          `Found and encoded ${Object.keys(filesystem).length} file(s)`,
        );
        let absOut = path.resolve(outFile);

        // format the output
        let content =
          format === "json"
            ? filesystem.asJSON()
            : format === "csv"
            ? filesystem.asCSV()
            : format === "tsv"
            ? filesystem.asTSV()
            : undefined;
        if (filesystem === undefined) {
          throw Error(
            `invalid --format '${format}' provided -- must be one of ${supportedFormats}`,
          );
        }

        // Write out the file
        console.info(`Beginning file write to ${absOut}`);
        let writeFile = promisify(fs.writeFile);
        await writeFile(absOut, content, "utf8").catch((err) => {
          console.error(
            `error occurred while attempting to write file to ${absOut}`,
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
    },
  )
  .demandCommand().argv;
