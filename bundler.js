const fs = require("fs");
const parser = require("@babel/parser");
const path = require("path");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");

let ID = 0;

function createAsset(fileName) {
  try {
    const content = fs.readFileSync(fileName, "utf-8");
    const ast = parser.parse(content, {
      sourceType: "module",
    });
    const dependencies = [];
    traverse(ast, {
      ImportDeclaration: ({ node }) => {
        dependencies.push(node.source.value.toString());
      },
    });
    const { code } = babel.transformFromAst(ast, null, {
      presets: ["@babel/preset-env"],
    });

    const id = ID++;
    return {
      id,
      fileName,
      dependencies,
      code,
    };
  } catch (error) {
    console.error(`Error processing file ${fileName}: ${error.message}`);
    return null;
  }
}

function createGraph(entry) {
  const mainAsset = createAsset(entry);
  if (!mainAsset) {
    throw new Error(`Failed to create asset for entry file: ${entry}`);
  }
  const queue = [mainAsset];
  for (const asset of queue) {
    const dirname = path.dirname(asset.fileName);
    asset.mapping = {};
    asset.dependencies.forEach((relativePath) => {
      let absolutePath = path.resolve(dirname, relativePath);
      if (!path.extname(absolutePath)) {
        absolutePath += ".js";
      }
      const child = createAsset(absolutePath);
      if (child) {
        asset.mapping[relativePath] = child.id;
        queue.push(child);
      } else {
        console.error(`Failed to create asset for ${absolutePath}`);
      }
    });
  }
  return queue;
}

function bundle(graph) {
  let modules = graph
    .map((mod) => {
      return `${mod.id}: [
      function(require, module, exports) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)}
    ]`;
    })
    .join(",\n");

  const result = `
  (function(modules) {
    function require(id) {
      const [fn, mapping] = modules[id];
      function localRequire(relativePath) {
        return require(mapping[relativePath]);
      }
      const module = { exports: {} };
      fn(localRequire, module, module.exports);
      return module.exports;
    }
    require(0);
  })({${modules}})
  `;
  return result;
}

try {
  const graph = createGraph("./entry.js");
  const result = bundle(graph);
  console.log(result);
} catch (error) {
  console.error("Bundling failed:", error.message);
}
