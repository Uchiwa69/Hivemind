// HM-25 : reconstruit de zéro l'exécutable autonome (Node SEA) et l'installateur Inno Setup dans dist/.
// Étapes : icône → bundle esbuild → blob SEA (avec public/) → copie de node.exe → icône et infos de version
// → injection du blob → vérification de l'exécutable → installateur HivemindSetup-<version>.exe.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const esbuild = require('esbuild');
const { inject } = require('postject');
const { makeIco } = require('./make-icon');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const { version } = require('../package.json');
const EXE = path.join(DIST, 'Hivemind.exe');
const ICON = path.join(DIST, 'hivemind.ico');
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function step(text) {
  console.log(`\n▶ ${text}`);
}

function publicAssets() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(path.join(ROOT, 'public'));
  // Clé « public/app.js » : celle que lit desktop.embeddedStatic().
  return Object.fromEntries(files.map((file) => [path.relative(ROOT, file).split(path.sep).join('/'), file]));
}

function findIscc() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Inno Setup 6', 'ISCC.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Inno Setup 6', 'ISCC.exe'),
  ];
  const found = candidates.find((file) => fs.existsSync(file));
  if (!found) throw new Error('Inno Setup 6 est introuvable. Installez-le avec : winget install JRSoftware.InnoSetup');
  return found;
}

// Lance l'exécutable avec des données jetables, vérifie qu'il sert la page et l'API, puis l'arrête.
async function smokeTest() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hivemind-check-'));
  const port = 3999;
  const child = spawn(EXE, [], {
    env: { ...process.env, HIVEMIND_PORT: String(port), HIVEMIND_NO_OPEN: '1', HIVEMIND_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  try {
    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      try {
        const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
        const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
        const script = await fetch(`http://127.0.0.1:${port}/app.js`);
        if (health.app !== 'hivemind' || !page.includes('<title>Hivemind</title>') || !script.ok) throw new Error('réponse inattendue');
        console.log(`  OK : Hivemind ${health.version} répond, page et app.js servis depuis l'exécutable.`);
        return;
      } catch {
        // pas encore prêt
      }
    }
    throw new Error(`L'exécutable ne répond pas.\n${output}`);
  } finally {
    child.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== 'win32') throw new Error('L\'installateur se construit sous Windows.');

  step('Nettoyage de dist/');
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  step('Icône');
  fs.writeFileSync(ICON, makeIco());

  step('Bundle du serveur (esbuild)');
  const bundle = path.join(DIST, 'hivemind.cjs');
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'server.js')],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: `node${process.versions.node.split('.')[0]}`,
    logLevel: 'warning',
    logOverride: { 'unsupported-dynamic-import': 'silent', 'unsupported-require-call': 'silent' },
  });

  step('Blob SEA avec les fichiers de public/');
  const blob = path.join(DIST, 'sea-prep.blob');
  const config = path.join(DIST, 'sea-config.json');
  fs.writeFileSync(config, JSON.stringify({
    main: bundle,
    output: blob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets: publicAssets(),
  }, null, 2));
  execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });

  step(`Copie de node.exe (${process.version}) vers Hivemind.exe`);
  fs.copyFileSync(process.execPath, EXE);

  step('Icône et informations de version (rcedit)');
  const rcedit = path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
  execFileSync(rcedit, [
    EXE,
    '--set-icon', ICON,
    '--set-file-version', version,
    '--set-product-version', version,
    '--set-version-string', 'ProductName', 'Hivemind',
    '--set-version-string', 'FileDescription', 'Hivemind',
    '--set-version-string', 'CompanyName', 'Uchiwa69',
    '--set-version-string', 'LegalCopyright', 'Uchiwa69',
    '--set-version-string', 'OriginalFilename', 'Hivemind.exe',
    '--set-version-string', 'InternalName', 'Hivemind',
  ], { stdio: 'inherit' });

  step('Injection du blob dans Hivemind.exe (postject)');
  await inject(EXE, 'NODE_SEA_BLOB', fs.readFileSync(blob), { sentinelFuse: SEA_FUSE });

  step('Vérification de l\'exécutable');
  await smokeTest();

  step('Installateur (Inno Setup)');
  execFileSync(findIscc(), [
    '/Qp',
    `/DAppVersion=${version}`,
    `/DDistDir=${DIST}`,
    path.join(ROOT, 'installer', 'hivemind.iss'),
  ], { stdio: 'inherit' });

  for (const name of ['hivemind.cjs', 'sea-prep.blob', 'sea-config.json']) fs.rmSync(path.join(DIST, name));
  const setup = path.join(DIST, `HivemindSetup-${version}.exe`);
  const mb = (file) => `${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} Mo`;
  console.log(`\n✔ Terminé :\n  ${EXE} (${mb(EXE)})\n  ${setup} (${mb(setup)})`);
}

main().catch((err) => {
  console.error(`\n✖ Échec de la construction : ${err.message}`);
  process.exit(1);
});
