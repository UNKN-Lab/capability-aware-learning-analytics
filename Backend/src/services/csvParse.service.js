import fs from "fs";
import csv from "csv-parser";

export function parseCsvFileToRawRows(filePath, options = {}) {
  const separator = options.separator || ",";

  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(filePath)
      .pipe(csv({ separator }))
      .on("data", (row) => {
        rows.push(row);
      })
      .on("end", () => {
        resolve(rows);
      })
      .on("error", reject);
  });
}