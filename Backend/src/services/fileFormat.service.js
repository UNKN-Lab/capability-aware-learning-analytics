import fs from "fs";

const CANDIDATE_DELIMITERS = [";", ",", "\t", "|"];

function countSegments(line, delimiter) {
  return String(line || "").split(delimiter).length;
}

export function readFirstLine(filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });

    let buffer = "";

    stream.on("data", (chunk) => {
      buffer += chunk;

      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex !== -1) {
        stream.destroy();
        resolve(buffer.slice(0, newlineIndex).replace(/\r$/, ""));
      }
    });

    stream.on("close", () => {
      if (buffer.length > 0) {
        resolve(buffer.replace(/\r$/, ""));
      }
    });

    stream.on("error", reject);
  });
}

export async function detectCsvDelimiter(filePath) {
  const firstLine = await readFirstLine(filePath);

  if (!firstLine || firstLine.trim().length === 0) {
    return {
      delimiter: ",",
      firstLine: "",
      confidence: 0,
      candidates: []
    };
  }

  const candidates = CANDIDATE_DELIMITERS.map((delimiter) => ({
    delimiter,
    columnCount: countSegments(firstLine, delimiter)
  }))
    .filter((item) => item.columnCount > 1)
    .sort((a, b) => b.columnCount - a.columnCount);

  if (candidates.length === 0) {
    return {
      delimiter: ",",
      firstLine,
      confidence: 0.2,
      candidates: []
    };
  }

  const best = candidates[0];

  return {
    delimiter: best.delimiter,
    firstLine,
    confidence: best.columnCount >= 3 ? 0.95 : 0.7,
    candidates
  };
}