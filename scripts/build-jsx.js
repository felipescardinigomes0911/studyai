// Compila app.jsx → app.js usando o Babel vendorizado (offline, sem dependências
// novas). Assim o JSX é transpilado no BUILD, não no navegador a cada abertura
// do app — inicialização bem mais rápida e sem carregar o Babel em runtime.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const babel = require(path.join(root, 'vendor', 'babel.min.js'));

const src = fs.readFileSync(path.join(root, 'app.jsx'), 'utf8');
const { code } = babel.transform(src, { presets: ['react'] });

// Sanidade: o resultado precisa ser JS válido.
new Function(code); // lança se houver erro de sintaxe

const banner = '// GERADO por scripts/build-jsx.js a partir de app.jsx — NÃO edite à mão.\n';
fs.writeFileSync(path.join(root, 'app.js'), banner + code + '\n');
console.log('✓ app.js gerado (' + code.split(/\n/).length + ' linhas)');
