import { promisify } from "util";
import fs from "fs";

type Coder<T> = {
  decode: Decode<T>;
  encode: Encode<T>;
};
type Decode<T> = (value: T) => Promise<Buffer>;
type Encode<T> = (filepath: string) => Promise<T>;

let readFile = promisify(fs.readFile);

let Base64: Coder<string> = {
  decode: async (base64) => {
    let buffer = Buffer.from(base64, "base64");
    return buffer;
  },
  encode: async (filepath) => {
    let base64 = readFile(filepath, "base64");
    return base64;
  },
};

export default Base64;
