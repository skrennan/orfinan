// Publish an explicit allowlist, never the repository root or development files.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const output = path.join(root,'dist');
const assets = ['index.html','app.js','sync.js','financial-validation.js','style.css','refinements.css','manifest.json','service-worker.js','icons/icon-192.svg','icons/icon-512.svg','vendor/supabase.min.js','vendor/chart.umd.min.js','vendor/supabase-LICENSE.txt','vendor/chart-LICENSE.txt','vendor/versions.json'];
// Only remove individual previously published files; do not recursively delete paths.
if (fs.existsSync(output)) {
  const walk = (directory) => {
    const realDirectory = fs.realpathSync(directory);
    if (realDirectory.toLowerCase() !== output.toLowerCase() && !realDirectory.toLowerCase().startsWith(output.toLowerCase()+path.sep)) throw new Error('Build path escapes dist');
    for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      const file = path.join(directory,entry.name);
      if (entry.isSymbolicLink()) throw new Error('Build output contains a symbolic link');
      if (entry.isDirectory()) walk(file);
      else fs.unlinkSync(file);
    }
  };
  if (fs.lstatSync(output).isSymbolicLink()) throw new Error('Build output cannot be a symbolic link');
  walk(output);
}
for (const asset of assets) {
  const destination = path.join(output,asset);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(path.join(root,asset),destination);
}
console.log(`Build ready: ${assets.length} public files in dist/`);
