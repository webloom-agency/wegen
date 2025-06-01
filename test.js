const fs = require("fs");
const path = require("path");

function getFileTypesInDir(directory = ".") {
  const extensionCounts = {};
  try {
    const items = fs.readdirSync(directory);
    for (const item of items) {
      const itemPath = path.join(directory, item);
      if (fs.statSync(itemPath).isFile()) {
        // path.extname returns ".txt" for "filename.txt"
        // or an empty string if no dot.
        const ext = path.extname(item);
        if (ext) {
          // Only consider files with an extension
          const lowerExt = ext.toLowerCase();
          extensionCounts[lowerExt] = (extensionCounts[lowerExt] || 0) + 1;
        }
      }
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(`Error: Directory not found: ${directory}`);
    } else if (error.code === "EACCES") {
      console.error(`Error: Permission denied for directory: ${directory}`);
    } else {
      console.error(`An unexpected error occurred: ${error.message}`);
    }
    return {};
  }
  return extensionCounts;
}

// Example usage:
const dirPath = "."; // Or specify another path
const counts = getFileTypesInDir(dirPath);

if (Object.keys(counts).length > 0) {
  console.log(`File types in '${path.resolve(dirPath)}':`);
  // Sort by count, descending
  const sortedExtensions = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [ext, count] of sortedExtensions) {
    console.log(`- ${ext}: ${count}`);
  }

  // To get just a unique list of extensions:
  const uniqueExtensions = Object.keys(counts).sort();
  console.log(`\nUnique extensions: ${uniqueExtensions.join(", ")}`);
} else {
  console.log(
    `No files with extensions found in '${path.resolve(
      dirPath,
    )}' or directory not accessible.`,
  );
}
