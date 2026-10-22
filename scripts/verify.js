'use strict';
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const python = process.env.KIRO_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const env = {...process.env, KIRO_TEST_PYTHON: python, PYTHONUTF8: '1'};
// Applies only to test child processes, including the Windows Hook subprocess.
if (process.platform === 'win32') env.PSExecutionPolicyPreference = 'Bypass';
function run(label, command, args) {
  console.log(`[verify] ${label}`);
  const result = spawnSync(command, args, {cwd: root, env, stdio: 'inherit', windowsHide: true});
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) { console.error(`Verification failed: ${label}`); process.exit(result.status || 1); }
}
run('Python asset dependency', python, ['-X','utf8','-c','import PIL; print("Pillow", PIL.__version__)']);
for (const file of fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js'))) run(`Syntax: ${file}`, process.execPath, ['--check',path.join('src',file)]);
run('JavaScript regression tests', process.execPath, ['--test',...fs.readdirSync(path.join(root,'test')).filter(f=>f.endsWith('.test.js')).map(f=>path.join('test',f))]);
run('Python syntax', python, ['-X','utf8','-m','py_compile','build_vsix.py',...fs.readdirSync(path.join(root,'scripts')).filter(f=>f.endsWith('.py')).map(f=>path.join('scripts',f))]);
if (process.platform !== 'win32') run('Bash Hook syntax', 'bash', ['-n','scripts/HookSignal.sh']);
run('Build VSIX', python, ['-X','utf8','build_vsix.py']);
run('Python regression and package checks', python, ['-X','utf8','-m','unittest','discover','-s','test','-p','test_*.py']);
run('Cross-platform frame timing', process.execPath, ['test/animation-conformance.js']);
if (process.platform === 'win32') run('Native WPF', 'powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-STA','-File','test/verify-wpf.ps1']);
if (process.argv.includes('--tk')) run('Native Tk (Linux needs a display or Xvfb)', python, ['-X','utf8','test/verify-tk.py']);
if (process.argv.includes('--browser')) run('Real browser', process.execPath, ['test/browser-animation-check.js']);
console.log('Verification passed.');
