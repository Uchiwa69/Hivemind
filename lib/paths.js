// HM-25 : mode installé (exécutable autonome Node SEA) ou mode développeur (npm start).
const os = require('os');
const path = require('path');

function detectPackaged() {
  try {
    return require('node:sea').isSea();
  } catch {
    return false;
  }
}

const isPackaged = detectPackaged();

// Installé : %APPDATA%\Hivemind (Program Files n'est pas modifiable) ; développeur : data/ du projet.
// HIVEMIND_DATA_DIR permet de tester l'exécutable sans toucher aux vraies données.
const DATA_DIR = process.env.HIVEMIND_DATA_DIR
  || (isPackaged ? path.join(process.env.APPDATA || os.homedir(), 'Hivemind') : path.join(__dirname, '..', 'data'));

module.exports = { isPackaged, DATA_DIR };
