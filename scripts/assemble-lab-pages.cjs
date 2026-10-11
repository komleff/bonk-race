// Собираем отдельный общий артефакт, сохраняя самостоятельные сборки всех лабораторий.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'client');
const apps = ['tuglab', 'u2taglab', 'tuglab2'];
for (const file of ['dist-lab/lab.html', ...apps.map(app => `dist-${app}/index.html`)]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Нет готовой сборки: ${file}`);
}
const out = path.join(root, 'dist-pages');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'dist-lab'), out, { recursive: true });
fs.renameSync(path.join(out, 'lab.html'), path.join(out, 'index.html'));
for (const app of apps) fs.cpSync(path.join(root, `dist-${app}`), path.join(out, app), { recursive: true });
console.log('Общий Pages-артефакт: BonkLab + TugLab + U2TagLab + TugLab-2');
